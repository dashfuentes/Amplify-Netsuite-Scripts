/**
 * @description
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 */
define(['N/file', 'N/log', 'N/record', 'N/query', 'N/runtime', '../lodash', 'N/search', '../moment'],function(file, log, record, query, runtime, _, search, moment) {
  /**
   * @description Marks the beginning of the Map/Reduce process and generates input data.
   * @typedef {Object} ObjectRef
   * @property {number} id - Internal ID of the record instance
   * @property {string} type - Record type id
   * @return {Array|Object|Search|RecordRef} inputSummary
   */
  function getInputData() {
    return query
      .runSuiteQL({
        query: "SELECT DISTINCT \
          IFF.id, \
          IFF.trandate, \
          FSO.type AS created_from_type, \
          IFIT.item, \
          IFIT.custcol_rsm_product_id AS product_id, \
          DSO.id AS dso_id, \
          DSOIT.uniquekey AS lineuniquekey, \
          IFIT.quantity, \
          IFIT.itemtype, \
          IFIT.kitmemberof, \
          COALESCE(IFIT.custcol_rsm_component_rate, 0) AS component_rate, \
          COALESCE(FSOIT.custcol_rfs23_cwgp_so_fso_item_rate, 0) AS item_rate, \
          IFIT.custcol_rev_event_rec AS revenue_event_id \
        FROM Transaction AS IFF \
        INNER JOIN TransactionLine IFIT ON (IFF.id = IFIT.transaction) \
        INNER JOIN TransactionLine AS DSOIT ON (DSOIT.custcol_rsm_product_id = IFIT.custcol_rsm_product_id) \
        INNER JOIN Transaction AS DSO ON (DSO.id = DSOIT.transaction) \
        INNER JOIN PreviousTransactionLineLink AS PTLL ON (PTLL.nextdoc = IFF.id) \
        INNER JOIN Transaction AS FSO ON (FSO.id = PTLL.previousdoc) \
        INNER JOIN TransactionLine AS FSOIT ON (FSO.id = FSOIT.transaction AND IFIT.item = FSOIT.item AND FSOIT.custcol_rsm_product_id IS NOT NULL) \
        WHERE IFF.type = 'ItemShip' \
          AND FSO.type != 'TrnfrOrd' \
          AND IFIT.custcol_rsm_product_id IS NOT NULL \
          AND IFIT.custcol_rev_event_rec IS NULL \
          AND DSO.type = 'SalesOrd' \
          AND DSO.custbody_rsm_so_type = 1",
        params: []
      })
      .asMappedResults();
  }

  /**
   * @description Executes when the map entry point is triggered and applies to each key/value pair.
   * @param {MapSummary} context - Data collection containing the key/value pairs to process through the map stage
   */
  function mapStage(context) {
    log.debug('MAP input', context.value);

    var input = JSON.parse(context.value);
    log.debug('transaction from map', input);

    try {
      // Kit parents won't be processed
      if( input.itemtype === 'Kit' ) return;

      var loadIFRecord = record.load({
        type: "itemfulfillment",
        id: input.id
      });
      log.debug("record", JSON.stringify(loadIFRecord));

      var getCurrentStatus = loadIFRecord.getText("shipstatus");
      log.debug("status", getCurrentStatus);

      if (getCurrentStatus !== "Shipped") {
        log.debug('IFF Status', 'The IFF with status other than Shipped is skipped from the revenue recognition process');
        return;
      }

      // Looking for line index
      var linesCount = loadIFRecord.getLineCount("item");
      log.debug("count item", linesCount);

      for (var index = 0; index < linesCount; index++) {
        var itemID = loadIFRecord.getSublistValue({
          sublistId: "item",
          fieldId: "item",
          line: index,
        });

        if(input.item == itemID) {
          input.line = index;
        }
      }
      log.debug("item Line", input);

      // Creating Revnue Event
      var revenueId =  createRevRecognition(input);
      log.debug('revenue id', revenueId);

      context.write({key: input.id, value: JSON.stringify({ sublistId: "item", line: input.line, fieldId: 'custcol_rev_event_rec', value: revenueId })});
    } catch(e) {
      log.error('M/R Script error','IFF: '+ input.id + ' DSO: ' + input.dso_id);
      log.error('M/R Script error', e);
    }

    return 'map complete';
  }

  /**
   * @description Executes when the reduce entry point is triggered and applies to each group.
   * @param {ReduceSummary} context - Data collection containing the groups to process through the reduce stage
   */
  function reduce(context) {
      log.debug('REDUCE Context', context.values);
      var itemFulfillment = record.load({ type: "itemfulfillment", id: context.key });

      // Updating all IFF lines with the Recognition Revenue ID
      _.forEach(context.values, function(val) {
        var it = JSON.parse(val);
        itemFulfillment.setSublistValue(it);
      });
      itemFulfillment.save();
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
    if(!_.isEmpty(summary.mapSummary.errors)) {
      log.error('errors', JSON.stringify(summary.mapSummary.errors));
    }
  }

  function createRevRecognition(data) {
    var newRecogntionRecord = record.create({
      type: "billingrevenueevent",
      isDynamic: true,
    });

    //Unique transaction item line
    newRecogntionRecord.setValue({
      fieldId: "transactionline",
      value: parseInt(data.lineuniquekey),
    });

    //Event Type
    newRecogntionRecord.setValue({
      fieldId: "eventtype",
      value: 3,
    });

    var quantity = Math.abs(+data.quantity);
    //Quantity
    newRecogntionRecord.setValue({
      fieldId: "quantity",
      value: quantity,
    });

    //Event Purpose
    newRecogntionRecord.setValue({
      fieldId: "eventpurpose",
      value: "ACTUAL",
    });

    //Event Date
    var trandate = moment(data.trandate);
    newRecogntionRecord.setValue({
      fieldId: "eventdate",
      value: trandate.toDate(),
    });

    var amount = (+data.component_rate || +data.item_rate) * quantity;
    log.debug('Amount', amount);
    newRecogntionRecord.setValue({
      fieldId: "amount",
      value: amount
    });

    var revRecord = newRecogntionRecord.save();
    return revRecord;
  }

  return {
    config:{
      retryCount: 3,
      exitOnError: false
    },
    getInputData: getInputData,
    map: mapStage,
    reduce: reduce,
    summarize: summarize
  };
});
