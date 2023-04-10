/**
 * @description 
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 */
define(['N/file', 'N/log', 'N/record', 'N/query', 'N/runtime', '../lodash', 'N/search'],function(file, log, record, query, runtime, _, search) {
  /**
   * @description Marks the beginning of the Map/Reduce process and generates input data.
   * @typedef {Object} ObjectRef
   * @property {number} id - Internal ID of the record instance
   * @property {string} type - Record type id
   * @return {Array|Object|Search|RecordRef} inputSummary
   */
  function getInputData() {
    var transactionId = runtime.getCurrentScript().getParameter({ name: 'custscript_rsm_mr_transactionid'});
    log.debug('transaction id from MR', transactionId)
    
    return [transactionId]
  }

  /**
   * @description Executes when the map entry point is triggered and applies to each key/value pair.
   * @param {MapSummary} context - Data collection containing the key/value pairs to process through the map stage
   */
  function mapStage(context) {
    log.debug('MAP input', context.value);
    try {
      
      var input = JSON.parse(context.value);
      log.debug('transaction from map', input);


    //  var newRecord = context.newRecord;
    var loadIFRecord = record.load({
      type: "itemfulfillment",
      id: input
    });
      var itemFromFullfillment = [];
      log.debug("record", JSON.stringify(loadIFRecord));

      var getCurrentStatus = loadIFRecord.getText("shipstatus");
      var trandate = loadIFRecord.getValue("trandate");
      log.debug("status", getCurrentStatus);
      var createdFromId = loadIFRecord.getValue("createdfrom");
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

      var linesCount = loadIFRecord.getLineCount("item");
      log.debug("count item", linesCount);

      for (var index = 0; index < linesCount; index++) {
        var itemFullfillmentId = loadIFRecord.getSublistValue({
          sublistId: "item",
          fieldId: "custcol_rsm_product_id",
          line: index,
        });
        log.debug("fullfillment id", itemFullfillmentId);
        var itemFullfillmentQty = loadIFRecord.getSublistValue({
          sublistId: "item",
          fieldId: "quantity",
          line: index,
        });
        // Item Fulfilment Component Rate
        var itemFullfillmentCR = loadIFRecord.getSublistValue({
          sublistId: "item",
          fieldId: "custcol_rsm_component_rate",
          line: index,
        });
        // Revenue Event ID
        var revEvent = loadIFRecord.getSublistValue({
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

              

        //find the item fullfillment lines with the same product id in the sales order
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
          var itemFulfillment = record.load({ type: loadIFRecord.type, id: loadIFRecord.id });
          _.forEach(updatedIFLines, function(it) {
            itemFulfillment.setSublistValue(it);
          });
          itemFulfillment.save();
        }
        log.debug('after looping', dsoLines.length);

    
    } catch(e) {
      log.error('Map Reduce Script error', e);
    }

    return 'map complete';
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
    log.audit('summary', summary);
    log.audit('input stage summary', summary.inputSummary);
    log.audit('map stage summary', summary.mapSummary);
    log.audit('reduce stage summary', summary.reduceSummary);
    _.forEach(summary.output.iterator(), function(k, v) {
      log.audit('summary.output key,value', k + ', ' + v);
      return true;
    });
    log.error('errors', JSON.stringify(summary.mapSummary.errors));
  }

  // function createFulFillmentRequest(itemFulfillment) {
  //   var fr = record.create({
  //     type: record.Type.FULFILLMENT_REQUEST
  //   })

  //   // Primary Information
  //   var entity = itemFulfillment.value({fieldId: 'entity'});
  //   fr.setValue({ fieldId: 'entity', value: entity });
  //   var trandate = itemFulfillment.value({fieldId: 'trandate'});
  //   fr.setValue({ fieldId: 'trandate', value: trandate });
  //   var transactionType = itemFulfillment.value({fieldId: 'custbody_amp_transaction_type'});
  //   if(transactionType) fr.setValue({ fieldId: 'custbody_amp_transaction_type', value: transactionType });
  //   var customerPO = itemFulfillment.value({fieldId: 'custbody_amplify_so_po'});
  //   if(customerPO) fr.setValue({ fieldId: 'custbody_amplify_so_po', value: customerPO });
  //   var multisiteOrder = itemFulfillment.value({fieldId: 'custbody_amp_multi_site_order'});
  //   if(multisiteOrder) fr.setValue({ fieldId: 'custbody_amp_multi_site_order', value: multisiteOrder });
  //   // only in Picked IF
  //   var multiYear = itemFulfillment.value({fieldId: 'custbody_amp_multi_site_order'});
  //   if(multiYear) fr.setValue({ fieldId: 'custbody_amp_multi_site_order', value: multiYear });
  //   var createdFrom = itemFulfillment.value({fieldId: 'createdfrom'});
  //   fr.setValue({ fieldId: 'createdfrom', value: createdFrom });
  //   var fulFillmentRep = itemFulfillment.value({fieldId: 'custbody_amp_fulfillment_rep'});
  //   if(fulFillmentRep) fr.setValue({ fieldId: 'custbody_amp_fulfillment_rep', value: fulFillmentRep });
  //   var frMemo = itemFulfillment.value({fieldId: 'memo'});
  //   if(frMemo) fr.setValue({ fieldId: 'memo', value: frMemo });

  //   // Control
  //   var frTargetShipDate = itemFulfillment.value({fieldId: 'custbody_fr_target_ship_date'});
  //   if(frTargetShipDate) fr.setValue({ fieldId: 'custbody_fr_target_ship_date', value: frTargetShipDate });
  //   var consolidateOrder = itemFulfillment.value({fieldId: 'custbody_amp_consolidate_ship'});
  //   if(consolidateOrder) fr.setValue({ fieldId: 'custbody_amp_consolidate_ship', value: consolidateOrder });
  //   var consolidateId = itemFulfillment.value({fieldId: 'custbody_so_consolidate_id'});
  //   if(consolidateId) fr.setValue({ fieldId: 'custbody_so_consolidate_id', value: consolidateId });
  //   var integrationStatus = itemFulfillment.value({fieldId: 'custbodyintegrationstatus'});
  //   if(integrationStatus) fr.setValue({ fieldId: 'custbodyintegrationstatus', value: integrationStatus });
  //   // INTERNAL NOTES FOR THIS SALES ORDER: custbody_amp_internal_notes
  //   // FULFILLMENT LOCATION: location

  //   // Clasification
  //   var lastModDate = itemFulfillment.value({fieldId: 'custbody_esc_last_modified_date'});
  //   if(lastModDate) fr.setValue({ fieldId: 'custbody_esc_last_modified_date', value: lastModDate });
  //   var createdDate = itemFulfillment.value({fieldId: 'custbody_esc_created_date'});
  //   if(createdDate) fr.setValue({ fieldId: 'custbody_esc_created_date', value: createdDate });
  //   var actDateShipped = itemFulfillment.value({fieldId: 'custbody_shipped_date'});
  //   if(actDateShipped) fr.setValue({ fieldId: 'custbody_shipped_date', value: actDateShipped });
  //   // Only in Packed IF
  //   var revRecEvent = itemFulfillment.value({fieldId: 'custbody_rsm_rev_rec_event'});
  //   if(revRecEvent) fr.setValue({ fieldId: 'custbody_rsm_rev_rec_event', value: revRecEvent });
  //   // SHIPMENT SERVICE TYPE: custbody_amp_ship_ser_tp
  //   // SHOOL YEAR: custbody_cwgp_so_rfs23_school_yr
  //   // ORDER FULLFILLMENT TYPE: custbody_cwgp_orderff_type
  //   // FULFILLMENT TYPE: fulfillmenttype

  //   // Logistics
  //   // Just for Picket IF
  //   var emailFDelivery = itemFulfillment.value({fieldId: 'custbody_email_for_delivery'});
  //   if(emailFDelivery) fr.setValue({ fieldId: 'custbody_email_for_delivery', value: emailFDelivery });
  //   // Just for Picket IF
  //   var phoneFDelivery = itemFulfillment.value({fieldId: 'custbody_phone_for_delivery'});
  //   if(phoneFDelivery) fr.setValue({ fieldId: 'custbody_phone_for_delivery', value: phoneFDelivery });
  //   // Just for Picket IF
  //   var deliveryLType = itemFulfillment.value({fieldId: 'custbody_delivery_location_type'});
  //   if(deliveryLType) fr.setValue({ fieldId: 'custbody_delivery_location_type', value: deliveryLType });
  //   // Just for Picket IF
  //   var canReceivePallets = itemFulfillment.value({fieldId: 'custbody_can_receive_pallets'});
  //   if(canReceivePallets) fr.setValue({ fieldId: 'custbody_can_receive_pallets', value: canReceivePallets });
  //   // Just for Picket IF
  //   var highLoadingDock = itemFulfillment.value({fieldId: 'custbody_high_loading_doc'});
  //   if(highLoadingDock) fr.setValue({ fieldId: 'custbody_high_loading_doc', value: highLoadingDock });
  //   // Just for Picket IF
  //   var palleteJack = itemFulfillment.value({fieldId: 'custbody_so_pallet_jack'});
  //   if(palleteJack) fr.setValue({ fieldId: 'custbody_so_pallet_jack', value: palleteJack });
  //   // Just for Picket IF
  //   var liftGateRequired = itemFulfillment.value({fieldId: 'custbody_so_ship_liftgaterequired'});
  //   if(liftGateRequired) fr.setValue({ fieldId: 'custbody_so_ship_liftgaterequired', value: liftGateRequired });
  //   // Just for Picket IF
  //   var daysOfOperation = itemFulfillment.value({fieldId: 'custbody_days_of_op'});
  //   if(daysOfOperation) fr.setValue({ fieldId: 'custbody_days_of_op', value: daysOfOperation });
  //   // Just for Picket IF
  //   var hoursOfOperation = itemFulfillment.value({fieldId: 'custbody_hours_of_operation'});
  //   if(hoursOfOperation) fr.setValue({ fieldId: 'custbody_hours_of_operation', value: hoursOfOperation });
  //   // Just for Picket IF
  //   var specialShippingInst = itemFulfillment.value({fieldId: 'custbody_special_ship_instructions'});
  //   if(specialShippingInst) fr.setValue({ fieldId: 'custbody_special_ship_instructions', value: specialShippingInst });
  //   // Just for Picket IF
  //   var specialServRequired = itemFulfillment.value({fieldId: 'custbody_special_service_required'});
  //   if(specialServRequired) fr.setValue({ fieldId: 'custbody_special_service_required', value: specialServRequired });
  //   // Just for Picket IF
  //   var elevatorMovePallets = itemFulfillment.value({fieldId: 'custbody_elevator_to_move_pallets'});
  //   if(elevatorMovePallets) fr.setValue({ fieldId: 'custbody_elevator_to_move_pallets', value: elevatorMovePallets });
  //   // Just for Picket IF
  //   var howManyFlightsOfStaris = itemFulfillment.value({fieldId: 'custbody_how_many_flights_of_stairs'});
  //   if(howManyFlightsOfStaris) fr.setValue({ fieldId: 'custbody_how_many_flights_of_stairs', value: howManyFlightsOfStaris });
  //   // Just for Picket IF
  //   var ssrInitiative = itemFulfillment.value({fieldId: 'custbody_ssr_initiative'});
  //   if(ssrInitiative) fr.setValue({ fieldId: 'custbody_ssr_initiative', value: ssrInitiative });
  //   // BILLING ADDRESS (DEFAULT): custbody_billing_add_default
  //   // VAT ID: custbody_vat_id

  //   fr.save();
  //   return fr;
  // }

  return {
    config:{
      retryCount: 3,
      exitOnError: false
    },
    getInputData: getInputData,
    map: mapStage,
    // reduce: reduce,
    summarize: summarize
  };
});
