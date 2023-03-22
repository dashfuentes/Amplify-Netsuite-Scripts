/**
 * @NApiVersion 2.x
 * @NScriptType usereventscript
 * duplicates all items associated to a category
 */
define(["N/search", "N/log", "N/runtime", "N/record", "../lodash"], function (
  search,
  log,
  runtime,
  record,
  _
) {
  function afterSubmit(context) {
    if (
      context.type === context.UserEventType.CREATE ||
      context.type === context.UserEventType.EDIT
    ) {
      var newRecord = context.newRecord;
      var itemFromFullfillment = [];
      log.debug("record", JSON.stringify(newRecord));

      var getCurrentStatus = newRecord.getText("shipstatus");
      var trandate = newRecord.getValue("trandate");
      log.debug("status", getCurrentStatus);
      var getDSO = newRecord.getValue("createdfrom");
      log.debug("sales order id", getDSO);

      if (getCurrentStatus !== "Shipped") return;

      var linesCount = newRecord.getLineCount("item");
      log.debug("count item", linesCount);

      for (var index = 0; index < linesCount; index++) {
        //consultar si siempre tendremos el proudct id
        var itemFullfillmentId = newRecord.getSublistValue({
          sublistId: "item",
          fieldId: "custcol_rsm_product_id",
          line: index,
        });
        log.debug("fullfillment id", itemFullfillmentId);
        var itemFullfillmentQty = newRecord.getSublistValue({
          sublistId: "item",
          fieldId: "quantity",
          line: index,
        });

        itemFromFullfillment.push({
          id: itemFullfillmentId,
          quantity: itemFullfillmentQty,
        });
      }
      log.debug("item ids", itemFromFullfillment);
      

      //Load the DSO to grab some important information about the item
      var loadDSORecord = record.load({
        type: record.Type.SALES_ORDER,
        id: getDSO,
       // isDynamic: true,
      });

    

      // log.debug("sales order record", loadDSORecord);
      var soLineCount = loadDSORecord.getLineCount({ sublistId: "item" });

      //fin the item fullfillment lines with the same product id in the sales order
      var dsoLineFounded = [];

      for (var index = 0; index < soLineCount; index++) {
        //  var line = loadDSORecord.selectLine({
        //    sublistId: "item",
        //    line: index,
        //  });
        var productId = loadDSORecord.getSublistValue({
          sublistId: "item",
          fieldId: "custcol_rsm_product_id",
          line: index,
        });
        var uniqueLine = loadDSORecord.getSublistValue({
          sublistId: "item",
          fieldId: "lineuniquekey",
          line: index,
        });
        //log.debug('unique', uniqueLine)
        // ????
        var revEvent = loadDSORecord.getSublistValue({
          sublistId: "item",
          fieldId: "custcol_rev_event_rec",
          line: index,
        });
        //log.debug('rev event field', revEvent)

        //  log.debug("line", line);
        // log.debug("line-product-id", productId);
        var findFullFullfillmentLine = _.find(
          itemFromFullfillment,
          function (fullfillment) {
            return fullfillment.id === productId;
          }
        );
        log.debug("after search line", findFullFullfillmentLine);
        //Create the revenue recoginition event
        if (
          findFullFullfillmentLine &&
          findFullFullfillmentLine.id === productId &&
          !revEvent
        ) {
          log.debug("*** creating revenue recognition record ***");
         var revenueId =  createRevRecognition(uniqueLine,findFullFullfillmentLine,trandate);
         log.debug('revenue id', revenueId)

         //Preguntar si debemos setear este valor en el item fullfillment
         loadDSORecord.setSublistValue({sublistId: 'item', fieldId: 'custcol_rev_event_rec',line: index, value: revenueId})
        

         loadDSORecord.save()

         log.debug('*** after save line rev record  id ***')

        }
      }
      //  log.debug('after looping', dsoLineFounded.length)
    }
  }

  function createRevRecognition(uniqueLine, fullfillmentItem, shippedDate) {
    try {
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
        value: fullfillmentItem.quantity,
      });

      //Event Purpose
      newRecogntionRecord.setValue({
        fieldId: "eventpurpose",
        value: "ACTUAL",
      });

      //Event Date
      newRecogntionRecord.setValue({
        fieldId: "eventdate",
        value: shippedDate,
      });

      //hacer el calculo para setear el campo amount

   var revRecord=   newRecogntionRecord.save()
      log.debug('*** after create rev rec ***', revRecord)
      return revRecord
    } catch (error) {
     return log.debug('Something went wrong!', error)
    }
  }
  return {
    afterSubmit: afterSubmit,
  };
});
