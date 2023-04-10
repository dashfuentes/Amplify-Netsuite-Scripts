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
    log.debug("MAP input", context.value);
    try {
      var input = JSON.parse(context.value);
      log.debug("transaction from map", input);
      var transactionId = input.id;

      //  var newRecord = context.newRecord;
      var loadRMATransaction = record.load({
        type: "returnauthorization",
        id: transactionId,
      });

      var isReadyForRevenue = loadRMATransaction.getValue(
        "custbody_rsm_ready_for_rev_scripts"
      );
      //  log.debug("sales order id", isReadyForRevenue);

      var RMAType = loadRMATransaction.getText("custbody_rsm_rma_type");
      //log.debug("rma type", RMAType);

      var linesCount = loadRMATransaction.getLineCount("item");
      //log.debug("count item", linesCount);

      var trandate = loadRMATransaction.getValue("trandate");

      if (isReadyForRevenue && RMAType === "Deal Return Authorization") {
        log.debug("*** It is a DEAL RMA Transaction ***");
        log.debug("*** Scenario #2 Credit/Refund for unshipped items  *** ");

        for (var index = 0; index < linesCount; index++) {
          var itemUniqueLine = loadRMATransaction.getSublistValue({
            sublistId: "item",
            fieldId: "lineuniquekey",
            line: index,
          });
          var itemId = loadRMATransaction.getSublistValue({
            sublistId: "item",
            fieldId: "custcol_rsm_product_id",
            line: index,
          });
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
            itemName.indexOf("-NI") ||
            itemName.indexOf("-NIA") ||
            itemName.indexOf("-NIK")
          ) {
            var result = query
              .runSuiteQL({
                query:
                  "SELECT DISTINCT  \
          IT.uniquekey\
          FROM transaction AS SO \
          INNER JOIN TransactionLine AS IT ON (SO.id = IT.transaction) \
          WHERE SO.type = 'SalesOrd' \
          AND SO.custbody_rsm_so_type = 1\
          AND SO.tranid LIKE 'DSO%' \
          AND IT.custcol_rsm_product_id =  ?",
                params: [itemId],
              })
              .asMappedResults();
            //  log.debug("getDSO", result);

            var revenuePositiveId = createPositiveRevRecognition(
              result[0].uniquekey,
              itemRate,
              itemQty,
              trandate
            );
            //  log.debug("positive revenue id", revenuePositiveId);

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
            //  log.debug("negative revenue id", revenueNegativeId);
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

        loadRMATransaction.setValue({
          fieldId: "custbody_rsm_process_revenue_event",
          value: false,
        });

        loadRMATransaction.save();
      } else {
        log.debug(
          "** The Ready for Revenue Script field should be check and it has to be a Deal RMA"
        );
        return;
      }
    } catch (e) {
      log.error("Map Reduce Script error", e);
    }

    return "map complete";
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
    log.error("errors", JSON.stringify(summary.mapSummary.errors));
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
