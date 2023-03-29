/**
 * @NApiVersion 2.x
 * @NScriptType usereventscript
 * duplicates all items associated to a category
 */
define(["N/search", "N/log", "N/runtime", "N/record", "../lodash", 'N/query'], function (
  search,
  log,
  runtime,
  record,
  _,
  query
) {
  function afterSubmit(context) {
    if (
      context.type === context.UserEventType.CREATE ||
      context.type === context.UserEventType.EDIT
    ) {
      try {
        var newRecord = context.newRecord;
        var itemFromFullfillment = [];
        log.debug("record", JSON.stringify(newRecord));

        var getCurrentStatus = newRecord.getText("shipstatus");
        var trandate = newRecord.getValue("trandate");
        log.debug("status", getCurrentStatus);
        var createdFromId = newRecord.getValue("createdfrom");
        log.debug("sales order id", createdFromId);

        if (getCurrentStatus !== "Shipped") return;

        // Getting createdFrom Transaction Type
        var createdFromLF = search.lookupFields({
          type: "transaction",
          id: createdFromId,
          columns: ['type']
      });
      log.debug('createdFrom Type', createdFromLF);

      if(createdFromLF && createdFromLF.type && createdFromLF.type.length > 0 && createdFromLF.type[0].value === 'TrnfrOrd') {
        log.debug('Created Form Type', 'The createdForm record type is Transfer Order and is ommited from the revenue recognition process');
        return;
      }

        var linesCount = newRecord.getLineCount("item");
        log.debug("count item", linesCount);

        for (var index = 0; index < linesCount; index++) {
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
          // Item Fulfilment Component Rate
          var itemFullfillmentCR = newRecord.getSublistValue({
            sublistId: "item",
            fieldId: "custcol_rsm_component_rate",
            line: index,
          });

          itemFromFullfillment.push({
            id: itemFullfillmentId,
            quantity: itemFullfillmentQty,
            componentRate: itemFullfillmentCR,
            ifIndex: index,
          });
        }
        log.debug("item ids", itemFromFullfillment);

        if(itemFromFullfillment.length === 0) {
          log.audit('Item Fulfillment', 'No item fulfillment was found to be processed');
          return;
        }

        itemFromFullfillment = _.filter(itemFromFullfillment, function(it) { return it.id; });
        if(itemFromFullfillment.length === 0) {
          log.audit('products Ids error', 'No product id was found to be processed');
          return;
        }

        // Remove AND SO.tranid LIKE 'DSO%' for producttion, this line is for testing only
        var result  = query.runSuiteQL({
          query: "SELECT DISTINCT \
            SO.id \
          FROM transaction AS SO \
          INNER JOIN TransactionLine AS IT ON (SO.id = IT.transaction) \
          WHERE SO.type = 'SalesOrd' \
            AND SO.custbody_rsm_so_type = 1 \
            AND SO.tranid LIKE 'DSO%' \
            AND IT.custcol_rsm_product_id = ?",
          params: [itemFromFullfillment[0].id]
        })
        .asMappedResults();
        log.debug('getDSO', result);

        if(result.length === 0) {
          log.audit('Sales Order ID', 'The order related to the product ID: '+itemFromFullfillment[0].id+' couldn\'t be found');
          return;
        }

        // Getting SO id from the search
        var getDSO = result[0].id;
        //Load the DSO to grab some important information about the item
        var loadDSORecord = record.load({
          type: record.Type.SALES_ORDER,
          id: getDSO,
        // isDynamic: true,
        });

        // log.debug("sales order record", loadDSORecord);
        var soLineCount = loadDSORecord.getLineCount({ sublistId: "item" });
        var updateDSO = false;

        //fin the item fullfillment lines with the same product id in the sales order
        var dsoLineFounded = [];
        var updatedIFLines = [];
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
            log.debug('revenue id', revenueId);

            // Updating SO
            loadDSORecord.setSublistValue({sublistId: 'item', fieldId: 'custcol_rev_event_rec',line: index, value: revenueId});
            updatedIFLines.push({ sublistId: "item", line: findFullFullfillmentLine.ifIndex, fieldId: 'custcol_rev_event_rec', value: revenueId });
            updateDSO = true;
            log.debug('*** after set line rev record  id ***');
          }
        }

        if(updateDSO) {
          loadDSORecord.save();
          var itemFulfillment = record.load({ type: newRecord.type, id: newRecord.id });
          _.forEach(updatedIFLines, function(it) {
            itemFulfillment.setSublistValue(it);
          });
          itemFulfillment.save();
        }
        log.debug('after looping', dsoLineFounded.length);
      } catch(e) {
        log.error('UE Scipt error', e);
      }
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

      newRecogntionRecord.setValue({
        fieldId: "amount",
        value: +fullfillmentItem.quantity * +fullfillmentItem.componentRate
      });

      var revRecord = newRecogntionRecord.save();
      log.debug('*** after create rev rec ***', revRecord);
      return revRecord;
    } catch (error) {
     return log.debug('Something went wrong!', error);
    }
  }
  return {
    afterSubmit: afterSubmit,
  };
});
