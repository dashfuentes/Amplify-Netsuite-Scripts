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
          IFIT.item, \
          IFIT.custcol_rsm_product_id AS product_id, \
          DSO.id AS dso_id, \
          DSOIT.uniquekey AS lineuniquekey, \
          IFIT.quantity, \
          IFIT.itemtype, \
          IFIT.kitmemberof, \
          COALESCE(IFIT.custcol_rsm_component_rate, 0) AS component_rate, \
          IFIT.custcol_rev_event_rec AS revenue_event_id \
        FROM Transaction AS IFF \
        INNER JOIN TransactionLine IFIT ON (IFF.id = IFIT.transaction) \
        INNER JOIN Transaction AS DSO ON (DSO.id = IFF.custbody_rsm_bso_dso_link) \
        INNER JOIN TransactionLine AS DSOIT ON (DSO.id = DSOIT.transaction AND DSOIT.custcol_rsm_product_id = IFIT.custcol_rsm_product_id) \
        WHERE IFF.type = 'ItemShip' \
          AND BUILTIN.DF(IFF.status) = 'Item Fulfillment : Shipped' \
          AND IFIT.itemtype != 'Kit'\
          AND IFIT.custcol_rsm_product_id IS NOT NULL \
          AND IFIT.custcol_rev_event_rec IS NULL \
          AND DSO.type = 'SalesOrd' \
          AND DSO.custbody_rsm_so_type = 1 \
          AND BUILTIN.DF(DSO.status) != 'Sales Order : Pending Approval'",
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
      var loadIFRecord = record.load({
        type: "itemfulfillment",
        id: input.id
      });
      log.debug("record", JSON.stringify(loadIFRecord));

      // Getting FSO
      var createdFromId = loadIFRecord.getValue({fieldId: "createdfrom"});
      log.debug("FSO ID", createdFromId);

      // Getting createdFrom Transaction Type
      var createdFromLF = search.lookupFields({
        type: "transaction",
        id: createdFromId,
        columns: ['type']
      });
      log.debug('createdFrom Type', createdFromLF);

      if(createdFromLF && createdFromLF.type && createdFromLF.type.length > 0 && createdFromLF.type[0].value === 'TrnfrOrd') {
        log.debug('Created Form Type', 'The createdForm record type is Transfer Order and is omitted from the revenue recognition process');
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

        var productID = loadIFRecord.getSublistValue({
          sublistId: "item",
          fieldId: "custcol_rsm_product_id",
          line: index,
        });

        if(input.item == itemID && input.product_id == productID) {
          input.line = index;
          log.debug("item Line", input);

          // Getting Item Rate
          var itemRateResults = query
            .runSuiteQL({
              query: "SELECT \
                FSO.id, \
                FSOIT.item, \
                FSOIT.custcol_rsm_product_id AS product_id, \
                COALESCE(FSOIT.custcol_rfs23_cwgp_so_fso_item_rate, 0) AS item_rate \
              FROM Transaction AS FSO \
              INNER JOIN TransactionLine AS FSOIT ON (FSO.id = FSOIT.transaction) \
              WHERE FSO.id = ? \
                AND FSOIT.item = ? \
                AND FSOIT.custcol_rsm_product_id = ?",
              params: [createdFromId, itemID, productID]
            })
            .asMappedResults();
          log.debug("itemRateResults", itemRateResults)

          var itemRate = 0;
          if(itemRateResults && itemRateResults.length > 0) {
            itemRate = itemRateResults[0].item_rate;
          }
          input.item_rate = itemRate;
          log.debug("Item Rate", itemRate);

          // Creating Revnue Event
          var revenueId =  createRevRecognition(input);
          log.debug('revenue id', revenueId);

          context.write({key: input.id, value: JSON.stringify({ sublistId: "item", line: input.line, fieldId: 'custcol_rev_event_rec', value: revenueId })});
        }
      }
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
