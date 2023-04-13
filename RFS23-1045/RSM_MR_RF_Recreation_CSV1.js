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

      var jsonData = [];
      if(input.name === now.format('YYYYMMDD') + '_csv1.csv') {
        var csvFile = file.load({id: input.id});

        // Converting CSV to JSON
        var csvData = Papa.parse(csvFile.getContents(), {
          header: true,
          delimiter: ",",
          skipEmptyLines: true,
          worker: true,
          step: function(results) {
            // Skipping emtpy values [{}]
            if(Array.isArray(results.data) && Object.keys(results.data[0]).length === 0) return;

            jsonData.push( _.mapKeys(results.data, function(v, k){ return _.camelCase(k); }));
            log.debug('Row:', results.data);
          }
        });
        log.debug('jsonData', jsonData);

        var IFStatus = {
          "Picked": "A",
          "Packed": "B",
          "Shipped": "C"
        };

        // Grouping IFF from jsonData
        var iffs = _.chain(jsonData).groupBy("documentNumber").map(function(val) {
          return { id: val.internalId, documentNumber: val[0].documentNumber, status: val[0].status, createdFromId: val[0].createdFromId, createdFrom: val[0].createdFrom, items: val };
        }).value();
        log.debug('iffs', iffs);

        // Creating Request Fulfillment
        _.forEach(iffs, function(iff) {
          // Creating RF
          var requestFulFillmentID = createFulFillmentRequest(iff);
          log.debug('requestFulfillment ID', requestFulFillmentID);
        });
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

  function createFulFillmentRequest(itemFulfillment) {
    var requestFulFillment = record.transform({
      fromType: record.Type.SALES_ORDER,
      fromId: itemFulfillment.createdFromId,
      toType: record.Type.FULFILLMENT_REQUEST,
      isDynamic: true
    });

    // requestFulFillment.setValue({ fieldId: 'tranid', value: itemFulfillment.documentNumber });
    requestFulFillment.setValue({ fieldId: 'statusref', value: itemFulfillment.status });
    requestFulFillment.setValue({ fieldId: 'externailid', value: itemFulfillment.id });

    _.forEach(itemFulfillment.items, function(it){
      requestFulFillment.selectNewLine({ sublistId: 'item' });
      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'item',
        value: it.itemId
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'location',
        value: it.locationId
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_amplify_so_isbn_formatted',
        value: it.isbn
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'quantity',
        value: it.quantity
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_amp_ddb',
        value: it.ddb
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_amp_dda',
        value: it.dda
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_amp_custom_ship_to',
        value: it.shipToCustom
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_item_tracking_numbers',
        value: it.itemTrackingNumbers
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_nscs_lot_no',
        value: it.lotNo
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_iff_ship_qty',
        value: it.shipQty
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_iff_ship_status',
        value: it.shipStatus
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_cwgp_couriershippeddate',
        value: it.courierShippedDate
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_sps_itemstatus',
        value: it.acknowledgmentItemStatus
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_amp_assembly_description',
        value: it.assemblyDescription
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_atlas_flightstart_d',
        value: it.flightStartDate
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_atlas_flightend_d',
        value: it.flightEndDate
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'class',
        value: it.productLineId
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_trainingid',
        value: it.trainingId
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_rsm_product_id',
        value: it.productId
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_qpc',
        value: it.qtyPerCarton
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_nscs_cartons_per_palle',
        value: it.cartonsPerPallet
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_nscs_science_kit_num_boxes',
        value: it.scienceKitNumberOfBoxes
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_amp_full_cartons_expected',
        value: it.expectedFullCartons
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_exp_pallet',
        value: it.expectedFullPallets
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_fullcartoncharges',
        value: it.fullCartonCharge
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_fullpalletcharges',
        value: it.fullPalletCharge
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_looseitemcharge',
        value: it.looseItemCharge
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_cartoncharge',
        value: it.perCartonCharge
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_flatlinecharge',
        value: it.flatLineProcessingCharge
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_sandhtotal',
        value: it.totalHandling
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'department',
        value: it.departmentId
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_ship_to_email_receiver',
        value: it.shipToEmailReceiver
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_so_item_tracking_hyperlink',
        value: it.trackingHyperlink
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_so_tracking_numbers',
        value: it.trackingNumberAssociated
      });

      requestFulFillment.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_so_item_tracking_link',
        value: it.trackingLink
      });
    });

    return requestFulFillment.save();
  }

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
