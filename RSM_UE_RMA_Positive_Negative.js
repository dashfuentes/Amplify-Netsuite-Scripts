/**
 * @NApiVersion 2.x
 * @NScriptType usereventscript
 * Create positive/negative revenue events for Deal Return Authorization
 */
define([
  "N/search",
  "N/log",
  "N/runtime",
  "N/record",
  "../lodash",
  "N/query",
], function (search, log, runtime, record, _, query) {
  function beforeSubmit(context) {
    if (
      context.type === context.UserEventType.CREATE
      // ||
      //DELETE EDIT LATER
      //  context.type === context.UserEventType.EDIT  //Double check with amplify if this needs ti run on EDIT as well
    ) {
      var newRecord = context.newRecord;

      var isReadyForRevenue = newRecord.getValue(
        "custbody_rsm_ready_for_rev_scripts"
      );
      //  log.debug("sales order id", isReadyForRevenue);

      var RMAType = newRecord.getText("custbody_rsm_rma_type");
      //log.debug("rma type", RMAType);

      var linesCount = newRecord.getLineCount("item");
      //log.debug("count item", linesCount);

      var trandate = newRecord.getValue("trandate");

      if (isReadyForRevenue && RMAType === "Deal Return Authorization") {
        log.debug("*** It is a DEAL RMA Transaction ***");
        log.debug("*** Scenario #2 Credit/Refund for unshipped items  *** ");

        for (var index = 0; index < linesCount; index++) {
          var itemUniqueLine = newRecord.getSublistValue({
            sublistId: "item",
            fieldId: "lineuniquekey",
            line: index,
          });
          var itemId = newRecord.getSublistValue({
            sublistId: "item",
            fieldId: "custcol_rsm_product_id",
            line: index,
          });
          var itemName = newRecord.getSublistValue({
            sublistId: "item",
            fieldId: "item_display",
            line: index,
          });

          var itemQty = newRecord.getSublistValue({
            sublistId: "item",
            fieldId: "quantity",
            line: index,
          });
          var itemRate = newRecord.getSublistValue({
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

            newRecord.setSublistValue({
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

            //Create additional reverse shipped revenue event
            var shippedNotReturned = newRecord.getSublistValue({
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
              newRecord.setSublistValue({
                sublistId: "item",
                fieldId: "custcol_rsm_reverse_rev_event",
                line: index,
                value: revenueNegativeNotReturned,
              });
            }

            newRecord.setSublistValue({
              sublistId: "item",
              fieldId: "custcol_rsm_negative_rev_event",
              line: index,
              value: revenueNegativeId,
            });
          }
        }

        return;
      } else {
        log.debug(
          "** The Ready for Revenue Script field should be check and it has to be a Deal RMA"
        );
        return;
      }
    }
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

  return {
    // afterSubmit: afterSubmit,
    beforeSubmit: beforeSubmit,
  };
});
