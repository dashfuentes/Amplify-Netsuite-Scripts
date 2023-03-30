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
        // log.debug("sales order id", createdFromId);

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
          // Revenue Event ID
          var revEvent = newRecord.getSublistValue({
            sublistId: "item",
            fieldId: "custcol_rev_event_rec",
            line: index,
          });
          itemFromFullfillment.push({
            id: itemFullfillmentId,
            quantity: itemFullfillmentQty,
            componentRate: itemFullfillmentCR,
            revEvent: revEvent,
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
          id: getDSO
        });

        // log.debug("sales order record", loadDSORecord);
        var soLineCount = loadDSORecord.getLineCount({ sublistId: "item" });
        var updateIFF = false;

        //fin the item fullfillment lines with the same product id in the sales order
        var dsoLines = [];
        var updatedIFLines = [];
        for (var index = 0; index < soLineCount; index++) {
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
          var trandate = loadDSORecord.getValue({ fieldId: "trandate"  });
          //log.debug('rev event field', revEvent)
          dsoLines.push({
            productId: productId,
            uniqueLine: uniqueLine,
            trandate: trandate
          });
        }
        log.debug('DSOLines', dsoLines);

        _.forEach(itemFromFullfillment, function(iff) {
          var dsoLine = _.find(dsoLines, function (dsoln) {
            return dsoln.productId === iff.id;
          });
          log.debug("dsoLine", dsoLine);

          //Create the revenue recoginition event
          if ( dsoLine && dsoLine.productId === iff.id && !iff.revEvent ) {
            log.debug('Revenue Creation Start',"*** creating revenue recognition record ***");
            var revenueId =  createRevRecognition(dsoLine.uniqueLine,iff,dsoLine.trandate);
            log.debug('revenue id', revenueId);

            // Updating SO
            // loadDSORecord.setSublistValue({sublistId: 'item', fieldId: 'custcol_rev_event_rec',line: index, value: revenueId});
            updatedIFLines.push({ sublistId: "item", line: iff.ifIndex, fieldId: 'custcol_rev_event_rec', value: revenueId });
            updateIFF = true;
          }
        });

        if(updateIFF) {
          // loadDSORecord.save();
          log.debug('updatedIFLines', updatedIFLines);
          var itemFulfillment = record.load({ type: newRecord.type, id: newRecord.id });
          _.forEach(updatedIFLines, function(it) {
            itemFulfillment.setSublistValue(it);
          });
          itemFulfillment.save();
        }
        log.debug('after looping', dsoLines.length);
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
      return revRecord;
    } catch (error) {
     return log.debug('Something went wrong!', error);
    }
  }
  return {
    afterSubmit: afterSubmit,
  };
});
