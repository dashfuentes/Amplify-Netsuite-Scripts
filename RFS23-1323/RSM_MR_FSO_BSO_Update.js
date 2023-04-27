/**
 * @description 
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 * This script wil process FullFillment Sales order to make updates within the BSO
 */
define([
  "N/file",
  "N/log",
  "N/record",
  "N/query",
  "N/runtime",
  "../lodash",
  "N/search",
], function (file, log, record, query, runtime, _, search) {
  /**
   * @description Marks the beginning of the Map/Reduce process and generates input data.
   * @typedef {Object} ObjectRef
   * @property {number} id - Internal ID of the record instance
   * @property {string} type - Record type id
   * @return {Array|Object|Search|RecordRef} inputSummary
   */
  function getInputData() {
    // var transactionId = runtime.getCurrentScript().getParameter({ name: 'custscript_rsm_mr_rma_id'});
    // log.debug('transaction id from MR', transactionId)
    var salesOrderSearch = search.create({
      type: "salesorder",
      filters:
     [
      ["type","anyof","SalesOrd"], 
      "AND", 
      ["custbody_rsm_so_type","anyof","2"], 
      "AND", 
      [["status","anyof","SalesOrd:H"],"OR",["custbody_rsm_close_order_proc_event","is","T"]], 
      "AND", 
      ["custbody_rsm_fso_closed_process","is","F"], 
      "AND", 
      ["mainline","is","T"]
   ],
      columns: [
        search.createColumn({ name: "internalid", label: "Internal ID" }),
      ],
    });

    return salesOrderSearch;
  }

  /**
   * @description Executes when the map entry point is triggered and applies to each key/value pair.
   * @param {MapSummary} context - Data collection containing the key/value pairs to process through the map stage
   */
  function mapStage(context) {
    log.debug("MAP input", context.value);
    try {
      var input = JSON.parse(context.value);
      log.debug("transaction from map", input);
      var transactionId = input.id;

      //  var newRecord = context.newRecord;
      var loadSOTransaction = record.load({
        type: "salesorder",
        id: transactionId,
      });


      var linesCount = loadSOTransaction.getLineCount("item");
      //log.debug("count item", linesCount);
      var BSOTransactionId = loadSOTransaction.getValue(
        "custbody_rsm_blank_ord_created"
      );
      log.debug("bso-transaction", BSOTransactionId);
      
    
      var SOItemInfo = [];
      var parentItems = [];

      for (var index = 0; index < linesCount; index++) {
        var itemId = loadSOTransaction.getSublistValue({
          sublistId: "item",
          fieldId: "custcol_rsm_product_id",
          line: index,
        });

        var itemQty = loadSOTransaction.getSublistValue({
          sublistId: "item",
          fieldId: "quantity",
          line: index,
        });

        var isClosed = loadSOTransaction.getSublistValue({
          sublistId: "item",
          fieldId: "isclosed",
          line: index,

        })
        

        var IFFStatus = loadSOTransaction.getSublistValue({
          sublistId: "item",
          fieldId: "custcol_cwgp_iff_link",
          line: index
        })
        var itemName = loadSOTransaction.getSublistValue({
          sublistId: "item",
          fieldId: "item_display",
          line: index,
        });

        //Getting group-parent items
        if(itemName.indexOf('-G') > 0){
          parentItems.push({id:itemId, qty: itemQty})
         }

        //Grabbing just the closed and unshipped lines
        if(isClosed && !IFFStatus){
          SOItemInfo.push({ id: itemId, qty: itemQty });
        }

        //

      }

     // log.debug('closed lines', SOItemInfo)
      //log.debug('after get item groups', parentItems)

      var itemIdsAndGroup = []
      //Excluding parent-based children
      _.forEach(SOItemInfo, function(singleitem){
        
        //
        var findItemGroupId = _.find(parentItems, function (line) {
          return line.id == singleitem.id;
        });
       
       //excluding parent-based children
        if( typeof findItemGroupId == 'undefined' && singleitem.id !== "" ) {
          itemIdsAndGroup.push({ id: singleitem.id, qty: singleitem.qty });
        }  
      })

      log.debug('after clean the FRMA lines', itemIdsAndGroup)
      //Merge single item + item groups
      var mergedItemDSOItem =  parentItems.concat(itemIdsAndGroup)
      log.debug('after merged w/ parents', mergedItemDSOItem)
      
      //Load the BSO in order to update some information

      if(BSOTransactionId){
        var BSOTransaction = record.load({
          type: "customsale_rsm_blanket_order_bso",
          id: BSOTransactionId,
        });
  
        var BSOLineCount = BSOTransaction.getLineCount("item");
        for (var index = 0; index < BSOLineCount; index++) {
          var BSOItemId = BSOTransaction.getSublistValue({
            sublistId: "item",
            fieldId: "custcol_rsm_product_id",
            line: index,
          });
  
          var BSOQtyRemaining = BSOTransaction.getSublistValue({
            sublistId: "item",
            fieldId: "custcol_rsm_remaining_qty",
            line: index,
          });
  
          var findBSOTransactionLine = _.find(mergedItemDSOItem, function (line) {
            return line.id === BSOItemId;
          });
         log.debug("after find transaction line", findBSOTransactionLine);
          if (
            findBSOTransactionLine &&
            findBSOTransactionLine !== "undefined" &&
            BSOItemId == findBSOTransactionLine.id
          ) {
            //Increase Remaining Qty
            log.debug("ready to update bso lines");
            

            var increaseQtyRemaining = BSOQtyRemaining + findBSOTransactionLine.qty;
            log.debug('after increase', increaseQtyRemaining)
            BSOTransaction.setSublistValue({
              sublistId: "item",
              fieldId: "custcol_rsm_remaining_qty",
              line: index,
              value: increaseQtyRemaining,
            });
          }
        }
        BSOTransaction.save()
      }

     

   
      

      //Set the field custbody_rsm_fso_closed_process to true to checked this transaction as completed and avoid duplicate process
       loadSOTransaction.setValue({
         fieldId: "custbody_rsm_fso_closed_process",
         value: true,
       });

        //Set false for individual closed lines scenario  (is not working)
         loadSOTransaction.setValue({
           fieldId: "custbody_rsm_close_order_proc_event",
           value: false,
         });

      loadSOTransaction.save();

      log.debug("** After save the transaction **");

      return;
      //  }
    } catch (e) {
      log.error("Map Reduce Script error", e);
    }

    return "map complete";
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
    log.audit("summary", summary);
    log.audit("input stage summary", summary.inputSummary);
    log.audit("map stage summary", summary.mapSummary);
    log.audit("reduce stage summary", summary.reduceSummary);
    _.forEach(summary.output.iterator(), function (k, v) {
      log.audit("summary.output key,value", k + ", " + v);
      return true;
    });
    log.error("errors", JSON.stringify(summary.mapSummary.errors));
  }

  return {
    config: {
      retryCount: 3,
      exitOnError: false,
    },
    getInputData: getInputData,
    map: mapStage,
    // reduce: reduce,
    summarize: summarize,
  };
});
