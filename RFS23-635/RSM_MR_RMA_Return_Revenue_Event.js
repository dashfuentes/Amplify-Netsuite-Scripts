/**
 * @description
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
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
    // var transactionId = runtime.getCurrentScript().getParameter({ name: 'custscript_rsm_mr_rma_id'});
    // log.debug('transaction id from MR', transactionId)
    var returnauthorizationSearch = search.create({
      type: "returnauthorization",
      filters: [
        ["type", "anyof", "RtnAuth"],
        "AND",
        ["custbody_rsm_process_revenue_event", "is", "T"],
        "AND",
        ["mainline", "is", "T"],
      ],
      columns: [
        search.createColumn({ name: "internalid", label: "Internal ID" }),
      ],
    });

    return returnauthorizationSearch;
  }

  /**
   * @description Executes when the map entry point is triggered and applies to each key/value pair.
   * @param {MapSummary} context - Data collection containing the key/value pairs to process through the map stage
   */
  function mapStage(context) {

    try {
      var input = JSON.parse(context.value);
      log.debug("transaction from map", input);
      var transactionId = input.id;

      
      var loadRMATransaction = record.load({
        type: "returnauthorization",
        id: transactionId,
      });

      var isReadyForRevenue = loadRMATransaction.getValue(
        "custbody_rsm_ready_for_rev_scripts"
      );
       

      var RMAType = loadRMATransaction.getText("custbody_rsm_rma_type"); 
      var linesCount = loadRMATransaction.getLineCount("item");
      var trandate = loadRMATransaction.getValue("trandate");
      var RMAStatus = loadRMATransaction.getValue("status");
     

      var getBSOTransactionId = loadRMATransaction.getValue(
        "custbody_rsm_blank_ord_created"
      );

     
      if(getBSOTransactionId == "") return log.error('The RMA does not have BSO and will not update nothing', 'RMA:' + transactionId)
       //We need to load the BSO in order to update some line fields
       var loadBSOTransaction = record.load({
        type: "customsale_rsm_blanket_order_bso",
        id: getBSOTransactionId,
      });

      if (isReadyForRevenue && RMAType === "Deal Return Authorization" &&  RMAStatus !== "Pending Approval") {
        log.debug("*** It is a DEAL RMA Transaction ***");
        log.debug("*** Scenario #2 Credit/Refund for unshipped items  *** ");

        var RMAProductIds = [];
        var RMAProductIdWithQtyShippedNotReturned = [];

        for (var index = 0; index < linesCount; index++) {
          var itemUniqueLine = loadRMATransaction.getSublistValue({
            sublistId: "item",
            fieldId: "lineuniquekey",
            line: index,
          });
          log.debug('unique key in RMA', itemUniqueLine)
          var itemId = loadRMATransaction.getSublistValue({
            sublistId: "item",
            fieldId: "custcol_rsm_product_id",
            line: index,
          });
          log.debug("itemId", itemId);
          var itemName = loadRMATransaction.getSublistValue({
            sublistId: "item",
            fieldId: "item_display",
            line: index,
          });

          var itemQty = loadRMATransaction.getSublistValue({
            sublistId: "item",
            fieldId: "quantity",
            line: index,
          });
          var itemRate = loadRMATransaction.getSublistValue({
            sublistId: "item",
            fieldId: "rate",
            line: index,
          });

         
          //Just for physical items only
          if (
            itemName.indexOf("-NI") > 0 ||
            itemName.indexOf("-NIA") > 0 ||
            itemName.indexOf("-NIK") > 0
          ) {

            //RMA product information
            RMAProductIds.push({id:itemId, qty: itemQty})
            var result = query
              .runSuiteQL({
                query:
                  "SELECT DISTINCT  \
          IT.uniquekey\
          FROM transaction AS SO \
          INNER JOIN TransactionLine AS IT ON (SO.id = IT.transaction) \
          WHERE SO.type = 'SalesOrd' \
          AND SO.custbody_rsm_so_type =  1 \
          AND IT.custcol_rsm_product_id =  ?",
                params: [itemId],
              })
              .asMappedResults();
            log.debug("getDSO", result);
            if(result.length){

              var revenuePositiveId = createPositiveRevRecognition(
                result[0].uniquekey,
                itemRate,
                itemQty,
                trandate
              );
                log.debug("positive revenue id", revenuePositiveId);
  
              //[Positive]
              loadRMATransaction.setSublistValue({
                sublistId: "item",
                fieldId: "custcol_rev_event_rec",
                line: index,
                value: revenuePositiveId,
              });
              
            var revenueNegativeId = createNegativeRevRecognition(
              itemUniqueLine,
              itemRate,
              itemQty,
              trandate
            );
              log.debug("negative revenue id", revenueNegativeId);
            //[Negative]
            loadRMATransaction.setSublistValue({
              sublistId: "item",
              fieldId: "custcol_rsm_negative_rev_event",
              line: index,
              value: revenueNegativeId,
            });

            //Create additional reverse shipped revenue event
            var shippedNotReturned = loadRMATransaction.getSublistValue({
              sublistId: "item",
              fieldId: "custcol_rsm_qty_shipped_not_returned",
              line: index,
            });

            log.debug("returned qty", shippedNotReturned);

            if (shippedNotReturned > 0) {
              //Need this for BSO updates
              RMAProductIdWithQtyShippedNotReturned.push({id:itemId, qty: itemQty})
              var revenueNegativeNotReturned =
                createNegativeRevRecognitionForNotReturned(
                  result[0].uniquekey,
                  itemRate,
                  shippedNotReturned,
                  trandate
                );
              log.debug(
                "after create negative for not returned",
                revenueNegativeNotReturned
              );

              //Set Reverse Shipped Revenue Event value
              loadRMATransaction.setSublistValue({
                sublistId: "item",
                fieldId: "custcol_rsm_reverse_rev_event",
                line: index,
                value: revenueNegativeNotReturned,
              });
            }
            }
          }
        }

        loadRMATransaction.setValue({
          fieldId: "custbody_rsm_process_revenue_event",
          value: false,
        });

        loadRMATransaction.save();

        if (getBSOTransactionId) {
          log.debug(
            "*** Ready for BSO updated regarding a Deal RMA ***"
          );
          var BSOLineCount = loadBSOTransaction.getLineCount("item");

          for (var index = 0; index < BSOLineCount; index++) {
            var itemBSOId = loadBSOTransaction.getSublistValue({
              sublistId: "item",
              fieldId: "custcol_rsm_product_id",
              line: index,
            });
            var itemBSOQtyRemain = loadBSOTransaction.getSublistValue({
              sublistId: "item",
              fieldId: "custcol_rsm_remaining_qty",
              line: index,
            });

            var itemBSOQtyRefunded = loadBSOTransaction.getSublistValue({
              sublistId: "item",
              fieldId: "custcol_rsm_qty_refunded",
              line: index,
            });

            var findRMAItemLine = _.find(RMAProductIds, function (line) {
              return line.id == itemBSOId;
            });
            //#Scenario #2
            if (
              findRMAItemLine &&
              findRMAItemLine !== "undefined" &&
              itemBSOId == findRMAItemLine.id
            ) {
              // //Decrease Remaining Quantity
              var decreaseRemainQty = itemBSOQtyRemain - findRMAItemLine.qty;
            
              loadBSOTransaction.setSublistValue({
                sublistId: "item",
                fieldId: "custcol_rsm_remaining_qty",
                line: index,
                value: decreaseRemainQty,
              });

              //Increase Qty Refunded
              var increaseQtyRefunded = itemBSOQtyRefunded + findRMAItemLine.qty;
             //   log.debug('increase refunded', increaseQtyRefunded)

              loadBSOTransaction.setSublistValue({
                sublistId: "item",
                fieldId: "custcol_rsm_qty_refunded",
                line: index,
                value: increaseQtyRefunded,
              });

              //Special update on the Remaining Qty Shipped
              if (
                RMAProductIdWithQtyShippedNotReturned &&
                RMAProductIdWithQtyShippedNotReturned.length
              ) {
                var findRMAItemLineForShipped = _.find(
                  RMAProductIdWithQtyShippedNotReturned,
                  function (line) {
                    return line.id == itemBSOId;
                  }
                );

                //Scenario #4 just for "Qty Shipped Not Returned"
                if (
                  findRMAItemLineForShipped &&
                  findRMAItemLineForShipped !== "undefined" &&
                  itemBSOId == findRMAItemLineForShipped.id
                ) {
                

                  var specialRemainQty =
                    itemBSOQtyRemain + findRMAItemLineForShipped.qty;
                  loadBSOTransaction.setSublistValue({
                    sublistId: "item",
                    fieldId: "custcol_rsm_remaining_qty",
                    line: index,
                    value: specialRemainQty,
                  });
                }
              }
            }
          }

          loadBSOTransaction.save();
          log.debug('*after update BSO transaction*')
        }

        //
      } else if (
        !isReadyForRevenue &&
        RMAType === "Fulfillment Return Authorization" &&
        RMAStatus !== "Pending Approval"
      ) {
        //*** BSO setting fields block *** //
        if (getBSOTransactionId) {
          log.debug("execute", getRMAItemLinesForFRMA(loadRMATransaction));
          var RMAItemInfoLines = getRMAItemLinesForFRMA(loadRMATransaction);

          if(RMAItemInfoLines.length > 0){
            var BSOLineCount = loadBSOTransaction.getLineCount("item");
            var isReShip = loadBSOTransaction.getValue("custbody_rsm_reship");
  
            for (var index = 0; index < BSOLineCount; index++) {
              var itemBSOId = loadBSOTransaction.getSublistValue({
                sublistId: "item",
                fieldId: "custcol_rsm_product_id",
                line: index,
              });
  
              var itemBSOPendingReturn = loadBSOTransaction.getSublistValue({
                sublistId: "item",
                fieldId: "custcol_rsm_qty_pend_return",
                line: index,
              });
  
              var findRMAItemLine = _.find(RMAItemInfoLines, function (line) {
                return line.id == itemBSOId;
              });
  
            
  
              if (
                findRMAItemLine &&
                findRMAItemLine !== "undefined" &&
                itemBSOId == findRMAItemLine.id
                // &&
                //  isReShip
              ) {
                log.debug("**it is a F-RMA and ready to update the BSO fields**");
                //Scenario #1 and #3
                //Increase Pending Return
                var increasePendingReturn = itemBSOPendingReturn + findRMAItemLine.qty;
                log.debug('increase pending return', increasePendingReturn)
                loadBSOTransaction.setSublistValue({
                  sublistId: "item",
                  fieldId: "custcol_rsm_qty_pend_return",
                  line: index,
                  value: increasePendingReturn,
                });
              }
            }
            loadBSOTransaction.save();
          }else{
            log.error('We could not get lines with the same ID in the BSO' + itemBSOId)
          }
        
        }

        loadRMATransaction.setValue({
          fieldId: "custbody_rsm_process_revenue_event",
          value: false,
        });

        loadRMATransaction.save();

        //*** BSO setting fields block *** //
      } else {
        loadRMATransaction.setValue({
          fieldId: "custbody_rsm_process_revenue_event",
          value: false,
        });

        loadRMATransaction.save();
        log.debug(
          "** The Ready for Revenue Script field should be check and it has to be a valid RMA"
        );
        return;
      }
    } catch (e) {
      log.error('M/R Script error','RMA: '+ transactionId);
      log.error('M/R Script error', e);
    }

    return "map complete";
  }
  /**
   * @param  {object} transactionObj
   * Get the RMA transaction lines information for Fulfillment Return Authorization type
   * 
   */
  function getRMAItemLinesForFRMA(transactionObj) {
    var linesCount = transactionObj.getLineCount("item");
  //  log.debug("count item", linesCount);
    var itemIds = [];
    for (var index = 0; index < linesCount; index++) {
      var itemId = transactionObj.getSublistValue({
        sublistId: "item",
        fieldId: "custcol_rsm_product_id",
        line: index,
      });
     // log.debug("itemId", itemId);
      var itemName = transactionObj.getSublistValue({
        sublistId: "item",
        fieldId: "item_display",
        line: index,
      });

      var itemQty = transactionObj.getSublistValue({
        sublistId: "item",
        fieldId: "quantity",
        line: index,
      });

      var NOComponents = transactionObj.getSublistValue({
        sublistId: "item",
        fieldId: "custcol_rsm_no_components",
        line: index,
      });

     //Scenario #1 If F-RMA line has No of Components = 1, 
     //then it is a single item and script can continue per current design i.e. update qty on BSO using qty on F-RMA line

    //Scenario #2 If F-RMA line has No of Components = blank and Item Name contains “-G”,
    // then this is the parent item group and script will update BSO using this line’s qty

     //Scenario #3 If F-RMA line has No of Components > 1, then it is a component line and script will ignore it.(No actions needed)  

      //Scenario #4 when a single item does not have No of components and -G in the item name will be getting the qty field


     if(NOComponents == 1 || itemName.indexOf('-G') > 0 && NOComponents == "" || itemName.indexOf('-G') < 0 && NOComponents == ""   ){
      itemIds.push({ id: itemId, qty: itemQty });
     }
    
    }
    return itemIds;
  }

  /**
   * @param  {number} uniqueLine
   * @param  {number} rate
   * @param  {number} qty
   * @param  {date} trandate
   * This function will create the positive revenue event transaction
   */
  function createPositiveRevRecognition(uniqueLine, rate, qty, trandate) {
    try {
      //Amount Calculation

      log.debug("unique line item", uniqueLine);
      var amount = rate * qty;
      log.debug("amount calculation", amount);

      var newRecogntionRecord = record.create({
        type: "billingrevenueevent",
        isDynamic: false,
      });

      //Unique transaction item line
      newRecogntionRecord.setValue({
        fieldId: "transactionline",
        value: uniqueLine,
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
        value: amount,
      });

      var revRecord = newRecogntionRecord.save();
      log.debug("*** after create rev rec ***", revRecord);
      return revRecord;
    } catch (error) {
      return log.debug("Something went wrong!", error);
    }
  }

  /**
   * @param  {number} uniqueLine
   * @param  {number} rate
   * @param  {number} qty
   * @param  {date} trandate
   * This function will create the negative revenue event transaction
   */
  function createNegativeRevRecognition(uniqueLine, rate, qty, trandate) {
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

  function createNegativeRevRecognitionForNotReturned(
    uniqueLine,
    rate,
    qty,
    trandate
  ) {
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
    if(!_.isEmpty(summary.mapSummary.errors)) {
      log.error('errors', JSON.stringify(summary.mapSummary.errors));
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
