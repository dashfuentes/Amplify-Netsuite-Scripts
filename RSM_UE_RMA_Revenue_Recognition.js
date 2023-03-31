/**
 * @NApiVersion 2.x
 * @NScriptType usereventscript
 * duplicates all items associated to a category
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
    //  context.type === context.UserEventType.EDIT
    ) {
      var newRecord = context.newRecord;

      var linesCount = newRecord.getLineCount("item");
      log.debug("count item", linesCount);

      var trandate = newRecord.getValue("trandate");

      var createdFromLF = search.lookupFields({
        type: "transaction",
        id: newRecord.id,
        columns: ["type"],
      });
      log.debug("createdFrom Type", createdFromLF);

      if (
        createdFromLF &&
        createdFromLF.type &&
        createdFromLF.type.length > 0 &&
        createdFromLF.type[0].value !== "TrnfrOrd" // Need to exlude the purchase order as well, I do not know the text though
      ) {
        log.debug("*** It is a RMA Transaction ***");

        for (var index = 0; index < linesCount; index++) {
          // //consultar si siempre tendremos el proudct id
          var itemReceiptId = newRecord.getSublistValue({
            sublistId: "item",
            fieldId: "custcol_rsm_product_id",
            line: index,
          });

          var itemComponentQty = newRecord.getSublistValue({
            sublistId: "item",
            fieldId: "quantity",
            line: index,
          });
          var itemComponentRate = newRecord.getSublistValue({
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
        AND SO.tranid LIKE 'DSO%' \
        AND IT.custcol_rsm_product_id =  ?",
              params: [itemReceiptId],
            })
            .asMappedResults();
        

          var revenueNegativeId = createRevRecognition(
            result[0].uniquekey,
            itemComponentRate,
            itemComponentQty,
            trandate
          );
          //log.debug("positive revenue id", revenueNegativeId);

          newRecord.setSublistValue({
            sublistId: "item",
            fieldId: "custcol_rev_event_rec",
            line: index,
            value: revenueNegativeId,
          });
        }

        log.debug("*** Scenario #1 Return for future shipment completed ***");
      } else {
        log.debug(
          "Created Form Type",
          "The createdForm record type is not a RMA and is ommited from the revenue recognition process"
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
  return {
    beforeSubmit: beforeSubmit,
  };
});
