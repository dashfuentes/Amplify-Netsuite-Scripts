/**
 * @description Ticket: RFS23-1045, Create a script to take in In-Flight IFFs, and re-create new FR and IFFs off of the data
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 */
define(['N/file', 'N/log', 'N/record', 'N/query', 'N/runtime', '../lodash', '../moment', '../papaparse'],function(file, log, record, query, runtime, _, moment, Papa) {
  /**
   * @description Marks the beginning of the Map/Reduce process and generates input data.
   * @typedef {Object} ObjectRef
   * @property {number} id - Internal ID of the record instance
   * @property {string} type - Record type id
   * @return {Array|Object|Search|RecordRef} inputSummary
   */
  function getInputData() {
    var folderId = runtime.getCurrentScript().getParameter({ name: 'custscript_rsm_sch_csv_folderid'});
    if(!folderId) throw new Error('The script parameter custscript_rsm_sch_csv_folderid was not set up!');

    return query.runSuiteQL({
      query: 'Select id,\
          name \
        FROM file \
        WHERE folder = ?',
      params: [folderId]
    }).asMappedResults();
  }

  /**
   * @description Executes when the map entry point is triggered and applies to each key/value pair.
   * @param {MapSummary} context - Data collection containing the key/value pairs to process through the map stage
   */
  function mapStage(context) {
    log.debug('MAP input', context.value);
    try {
      var now   = moment();
      var input = JSON.parse(context.value);

      if(input.name === now.format('YYYYMMDD') + '_csv1.csv') {
        var csvFile = file.load({id: input.id});
        var csvData = Papa.parse(csvFile.getContents(), {
          header: true,
          delimiter: ",",
          worker: true,
          step: function(results) {
            log.debug('Row:', results.data);
          }
        });
        log.debug('csvData', csvData);
      }
    } catch(e) {
      log.error('Map Reduce Script error', e);
    }

    return 'map complete';
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
