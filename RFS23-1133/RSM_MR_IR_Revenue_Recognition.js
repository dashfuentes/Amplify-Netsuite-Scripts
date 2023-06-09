/**
 * @description
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 * This script will process all the item receipt transactions with the field Process Item Receipt Event as true
 */
define([
  "N/file",
  "N/log",
  "N/record",
  "N/query",
  "N/runtime",
  "../lodash",
  "N/search",
], function (file, log, record, query, runtime, _, search) {
  /**
   * @description Marks the beginning of the Map/Reduce process and generates input data.
   * @typedef {Object} ObjectRef
   * @property {number} id - Internal ID of the record instance
   * @property {string} type - Record type id
   * @return {Array|Object|Search|RecordRef} inputSummary
   */
  function getInputData() {
    var itemReceiptSearch = search.create({
      type: "itemreceipt",
      filters: [
        ["type", "anyof", "ItemRcpt"],
        "AND",
        ["custbody_rsm_item_rec_process_event", "is", "T"],
        "AND",
        ["mainline", "is", "T"],
      ],
      columns: [
        search.createColumn({ name: "internalid", label: "Internal ID" }),
      ],
    });

    return itemReceiptSearch;
  }

  /**
   * @description Executes when the map entry point is triggered and applies to each key/value pair.
   * @param {MapSummary} context - Data collection containing the key/value pairs to process through the map stage
   */
  function mapStage(context) {
    log.debug("MAP input", context.value);
    try {
      var input = JSON.parse(context.value);
      log.debug("transaction from map", input);
      var transactionId = input.id;

      var loadIRTransaction = record.load({
        type: "itemreceipt",
        id: transactionId,
      });

      var linesCount = loadIRTransaction.getLineCount("item");
      log.debug("count item", linesCount);

      var trandate = loadIRTransaction.getValue("trandate");

      var createdFromLF = search.lookupFields({
        type: "transaction",
        id: loadIRTransaction.getValue("createdfrom"),
        columns: ["type"],
      });
      log.debug("createdFrom Type", createdFromLF);

      if (
        createdFromLF &&
        createdFromLF.type &&
        createdFromLF.type.length > 0 &&
        createdFromLF.type[0].value !== "TrnfrOrd" &&
        createdFromLF.type[0].value !== "ItemRcpt" &&
        createdFromLF.type[0].value !== "PurchOrd" 

      ) {
        log.debug("*** It is a valid RMA Transaction ***");

        //*** BEGIN We need to load the potential RMA transaction in order to do some different logic for F-RMA ***//

        var createdFromTransaction = loadIRTransaction.getValue("createdfrom");

        var loadRMATransaction = record.load({
          type: "returnauthorization",
          id: createdFromTransaction,
        });

        //RMA Transaction Type
        var RMATransactionType = loadRMATransaction.getValue(
          "custbody_rsm_rma_type"
        );
        log.debug("RMA Type", RMATransactionType);
        var isReShip = loadRMATransaction.getValue("custbody_rsm_reship");
        log.debug("isReship?", isReShip);
        var BSOTransactionId = loadRMATransaction.getValue(
          "custbody_rsm_blank_ord_created"
        );
        log.debug("BSO Transaction ID", BSOTransactionId);
        //Avoiding some potential transactions with no BSO
        if (BSOTransactionId) {
          var loadBSOTransaction = record.load({
            type: "customsale_rsm_blanket_order_bso",
            id: BSOTransactionId,
          });

          var BSOlinesCount = loadBSOTransaction.getLineCount("item");

          var itemReceiptItem = [];

          // Just for FullFillment RMA Transactions
          if (RMATransactionType && RMATransactionType == 2) {
            log.debug("*** It is a Fullfillment RMA Transaction ***");

            //We need to find item group withint the RMA first
            var RMACountItem = loadRMATransaction.getLineCount("item");
            log.debug("rma count item", RMACountItem);
            var RMAItemLine = [];

            for (var index = 0; index < RMACountItem; index++) {
              var RMAItemId = loadRMATransaction.getSublistValue({
                sublistId: "item",
                fieldId: "custcol_rsm_product_id",
                line: index,
              });
              var RMAItemQty = loadRMATransaction.getSublistValue({
                sublistId: "item",
                fieldId: "quantity",
                line: index,
              });

              var RMAItemName = loadRMATransaction.getSublistValue({
                sublistId: "item",
                fieldId: "item_display",
                line: index,
              });

              if (
                RMAItemName &&
                RMAItemName !== "undefined"
                //&&
                // RMAItemName.indexOf("-G") > 0
              ) {
                RMAItemLine.push({ id: RMAItemId, qty: RMAItemQty });
              }
            }

            //We will update the blanket sales order based on the product id from the item receipt lines

            for (var index = 0; index < linesCount; index++) {
              var itemReceiptId = loadIRTransaction.getSublistValue({
                sublistId: "item",
                fieldId: "custcol_rsm_product_id",
                line: index,
              });
              var itemComponentQty = loadIRTransaction.getSublistValue({
                sublistId: "item",
                fieldId: "quantity",
                line: index,
              });
              var itemComponentRate = loadIRTransaction.getSublistValue({
                sublistId: "item",
                fieldId: "custcol_rsm_component_rate",
                line: index,
              });

              var itemReceiptQTY = loadIRTransaction.getSublistValue({
                sublistId: "item",
                fieldId: "quantity",
                line: index,
              });
              var itemReceiptQTYComponent = loadIRTransaction.getSublistValue({
                sublistId: "item",
                fieldId: "custcol_rsm_qty_component",
                line: index,
              });
              var itemReceiptNOComponent = loadIRTransaction.getSublistValue({
                sublistId: "item",
                fieldId: "custcol_rsm_no_components",
                line: index,
              });
              var itemAdditionalRate = loadIRTransaction.getSublistValue({
                sublistId: "item",
                fieldId: "custcol_rfs23_cwgp_so_fso_item_rate",
                line: index
              })

              //RFS23-1193 Item Group Requirements for Item Receipt

              //Scenario #1 •	If Item Receipt line has No of Components = 1, then script can continue per current design i.e. update qty on BSO using qty on F-RMA line

              if (itemReceiptNOComponent == 1) {
                log.debug("scenario #1");
                var findItemRMAId = _.find(RMAItemLine, function (line) {
                  return line.id == itemReceiptId;
                });
                if (
                  findItemRMAId &&
                  typeof findItemRMAId !== "undefined" &&
                  itemReceiptId == findItemRMAId.id
                ) {
                  itemReceiptItem.push({
                    id: itemReceiptId,
                    qty: findItemRMAId.qty,
                  });
                }
              }

              //Scenario #2 •	If Item Receipt line has No of Components > 1, then script calculates Item Group Qty by dividing Quantity by Qty of Component
              if (itemReceiptNOComponent > 1) {
                log.debug("scenario #2");
                //Calculate item group qty
                var itemGroupQTY = itemReceiptQTY / itemReceiptQTYComponent;
                // log.debug("after calculate", itemGroupQTY);
                itemReceiptItem.push({ id: itemReceiptId, qty: itemGroupQTY });
              }
              //Scenario with No of Components empty and rate empty

              if (itemReceiptNOComponent == "" || itemComponentRate == "") {
              log.debug('Scenario with no components empty and ', itemReceiptId)

              var getUniqueKeyItem = query
              .runSuiteQL({
                query:
                  "SELECT DISTINCT  \
         IT.uniquekey\
        FROM transaction AS SO \
        INNER JOIN TransactionLine AS IT ON (SO.id = IT.transaction) \
        WHERE SO.type = 'SalesOrd' \
        AND SO.custbody_rsm_so_type = 1\
        AND IT.custcol_rsm_product_id =  ?",
                params: [itemReceiptId],
              })
              .asMappedResults();

            // log.debug("after get rate", getRateFromFSO);
             if(getUniqueKeyItem.length) { 
              var revenueId = createRevRecognition(
                getUniqueKeyItem[0].uniquekey,
                itemAdditionalRate,
                itemComponentQty,
                trandate
              );
              log.debug("revenue id was created!!", revenueId);

              loadIRTransaction.setSublistValue({
                sublistId: "item",
                fieldId: "custcol_rev_event_rec",
                line: index,
                value: revenueId,
              });

              
              itemReceiptItem.push({ id: itemReceiptId, qty: itemComponentQty });
             }


              }

              //Create Negative Revenue Event

              var result = query
                .runSuiteQL({
                  query:
                    "SELECT DISTINCT  \
          IT.uniquekey\
          FROM transaction AS SO \
          INNER JOIN TransactionLine AS IT ON (SO.id = IT.transaction) \
          WHERE SO.type = 'SalesOrd' \
          AND SO.custbody_rsm_so_type = 1\
          AND IT.custcol_rsm_product_id =  ?",
                  params: [itemReceiptId],
                })
                .asMappedResults();

             // log.debug("after get result", result);
              //Create Revenue Event Transactions
              if (
                result.length &&
                itemReceiptNOComponent !== "" &&
                itemComponentRate !== ""
              ) {
                var revenueNegativeId = createRevRecognition(
                  result[0].uniquekey,
                  itemComponentRate,
                  itemComponentQty,
                  trandate
                );
                //log.debug("positive revenue id", revenueNegativeId);

                loadIRTransaction.setSublistValue({
                  sublistId: "item",
                  fieldId: "custcol_rev_event_rec",
                  line: index,
                  value: revenueNegativeId,
                });
              }
            }

            // loadIRTransaction.save();

            //log.debug("after IR loop", itemReceiptItem);
            //Scenario #3 •	If Item Receipt line has same Product ID as another line that script has processed, then script will ignore line (these are the multiple component lines related to one item group)
            var uniqueIRLines = _.uniqBy(itemReceiptItem, "id");
             log.debug('after remove duplicate', uniqueIRLines)

            //Once we got the item ids we can dig into the BSO lines and get the item coincidence
            for (var index = 0; index < BSOlinesCount; index++) {
              var itemBSOId = loadBSOTransaction.getSublistValue({
                sublistId: "item",
                fieldId: "custcol_rsm_product_id",
                line: index,
              });

              var itemBSOQtyPendingReturn = loadBSOTransaction.getSublistValue({
                sublistId: "item",
                fieldId: "custcol_rsm_qty_pend_return",
                line: index,
              });

              var itemBSOQtyReturned = loadBSOTransaction.getSublistValue({
                sublistId: "item",
                fieldId: "custcol_rsm_qty_returned",
                line: index,
              });

              var itemBSOQtyRemain = loadBSOTransaction.getSublistValue({
                sublistId: "item",
                fieldId: "custcol_rsm_remaining_qty",
                line: index,
              });

              var itemBSOSumQTYShipped = loadBSOTransaction.getSublistValue({
                sublistId: "item",
                fieldId: "custcol_rsm_sum_qty_shpd",
                line: index,
              });

              var findIRItemLine = _.find(uniqueIRLines, function (line) {
                return line.id == itemBSOId;
              });

              //  log.debug("line founded to be process", findIRItemLine);
              if (
                findIRItemLine &&
                findIRItemLine !== "undefined" &&
                itemBSOId == findIRItemLine.id
              ) {
                log.debug("**ready to update the BSO fields**");
                var decreasePendingReturn =
                  itemBSOQtyPendingReturn - findIRItemLine.qty;
                log.debug("after create", decreasePendingReturn);

                //Decrease QTY Pending return
                loadBSOTransaction.setSublistValue({
                  sublistId: "item",
                  fieldId: "custcol_rsm_qty_pend_return",
                  line: index,
                  value: decreasePendingReturn,
                });

                //Increase QTY Returned
                var increaseQTYReturned =
                  itemBSOQtyReturned + findIRItemLine.qty;
                loadBSOTransaction.setSublistValue({
                  sublistId: "item",
                  fieldId: "custcol_rsm_qty_returned",
                  line: index,
                  value: increaseQTYReturned,
                });

                //Increase Remaining Quantity
                var increaseRemainQty = itemBSOQtyRemain + findIRItemLine.qty;
                loadBSOTransaction.setSublistValue({
                  sublistId: "item",
                  fieldId: "custcol_rsm_remaining_qty",
                  line: index,
                  value: increaseRemainQty,
                });

                if (isReShip) {
                  //Decrease Sum Qty Shipped
                  var decreaseSumQTYShipped =
                    itemBSOSumQTYShipped - findIRItemLine.qty;
                  loadBSOTransaction.setSublistValue({
                    sublistId: "item",
                    fieldId: "custcol_rsm_sum_qty_shpd",
                    line: index,
                    value: decreaseSumQTYShipped,
                  });
                }
              }
            }

            //Save the BSO transaction after update all the lines above
            loadBSOTransaction.save();
            loadIRTransaction.setValue({
              fieldId: "custbody_rsm_item_rec_process_event",
              value: false,
            });

            loadIRTransaction.save();
            return;
          }

          //*** END We need to load the potential RMA transaction in order to do some different logic for F-RMA ***//
        }

        for (var index = 0; index < linesCount; index++) {
          var itemReceiptId = loadIRTransaction.getSublistValue({
            sublistId: "item",
            fieldId: "custcol_rsm_product_id",
            line: index,
          });

          var itemComponentQty = loadIRTransaction.getSublistValue({
            sublistId: "item",
            fieldId: "quantity",
            line: index,
          });
          var itemComponentRate = loadIRTransaction.getSublistValue({
            sublistId: "item",
            fieldId: "custcol_rsm_component_rate",
            line: index,
          });

          //Getting the right line from the DSO item container
          var result = query
            .runSuiteQL({
              query:
                "SELECT DISTINCT  \
        IT.uniquekey\
        FROM transaction AS SO \
        INNER JOIN TransactionLine AS IT ON (SO.id = IT.transaction) \
        WHERE SO.type = 'SalesOrd' \
        AND SO.custbody_rsm_so_type = 1\
        AND IT.custcol_rsm_product_id =  ?",
              params: [itemReceiptId],
            })
            .asMappedResults();

          //   log.debug('result', result)

          if (result.length) {
            var revenueNegativeId = createRevRecognition(
              result[0].uniquekey,
              itemComponentRate,
              itemComponentQty,
              trandate
            );
            //log.debug("positive revenue id", revenueNegativeId);

            loadIRTransaction.setSublistValue({
              sublistId: "item",
              fieldId: "custcol_rev_event_rec",
              line: index,
              value: revenueNegativeId,
            });
          }
        }

        loadIRTransaction.setValue({
          fieldId: "custbody_rsm_item_rec_process_event",
          value: false,
        });

        loadIRTransaction.save();
        log.debug("*** Scenario #1 Return for future shipment completed ***");
      } else {
        loadIRTransaction.setValue({
          fieldId: "custbody_rsm_item_rec_process_event",
          value: false,
        });

        loadIRTransaction.save();
        log.debug(
          "Created Form Type",
          "The createdForm record type is not a RMA and is ommited from the revenue recognition process"
        );
        return;
      }
    } catch (e) {
      log.error("M/R Script error", "Item Receipt: " + transactionId);
      log.error("M/R Script error", e);
    }

    return "map complete";
  }

  /**
   * @param  {number} uniqueLine
   * @param  {number} rate
   * @param  {number} qty
   * @param  {date} trandate
   * Create a positive revenue event transaction record
   */
  function createRevRecognition(uniqueLine, rate, qty, trandate) {
    try {
      //Amount Calculation
      var amount = rate * qty;
      log.debug("amount calculation", amount);

      var newRecogntionRecord = record.create({
        type: "billingrevenueevent",
        isDynamic: true,
      });

      //Unique transaction item line
      newRecogntionRecord.setValue({
        fieldId: "transactionline",
        value: parseInt(uniqueLine),
      });

      //Event Type
      newRecogntionRecord.setValue({
        fieldId: "eventtype",
        value: 3,
      });

      //Quantity
      newRecogntionRecord.setValue({
        fieldId: "quantity",
        value: -Math.abs(qty),
      });

      //Event Purpose
      newRecogntionRecord.setValue({
        fieldId: "eventpurpose",
        value: "ACTUAL",
      });

      //Event Date
      newRecogntionRecord.setValue({
        fieldId: "eventdate",
        value: trandate,
      });

      //Amount
      newRecogntionRecord.setValue({
        fieldId: "amount",
        value: -Math.abs(amount),
      });

      var revRecord = newRecogntionRecord.save();
      log.debug("*** after create rev rec ***", revRecord);
      return revRecord;
    } catch (error) {
      return log.debug("Something went wrong!", error);
    }
  }

  /**
   * @description Executes when the reduce entry point is triggered and applies to each group.
   * @param {ReduceSummary} context - Data collection containing the groups to process through the reduce stage
   */
  function reduce(context) {
    // _reduceContext.write({
    //   key: _reduceContext.key ,
    //   value: _reduceContext.values
    // });
  }

  /**
   * @description Executes when the summarize entry point is triggered and applies to the result set.
   * @param {Summary} summary - Holds statistics regarding the execution of a map/reduce script
   */
  function summarize(summary) {
    // summarize totals
    log.audit("summary", summary);
    log.audit("input stage summary", summary.inputSummary);
    log.audit("map stage summary", summary.mapSummary);
    log.audit("reduce stage summary", summary.reduceSummary);
    _.forEach(summary.output.iterator(), function (k, v) {
      log.audit("summary.output key,value", k + ", " + v);
      return true;
    });
    if (!_.isEmpty(summary.mapSummary.errors)) {
      log.error("errors", JSON.stringify(summary.mapSummary.errors));
    }
  }

  return {
    config: {
      retryCount: 3,
      exitOnError: false,
    },
    getInputData: getInputData,
    map: mapStage,
    // reduce: reduce,
    summarize: summarize,
  };
});
