'use strict';

module.exports={
  experiment:'P7-E4',
  frozenBeforeSourceInspection:true,
  policy:{
    swapAfterResult:false,
    problemHintToExplorer:false,
    preserveInitialMisses:true,
    requireNormalControls:true
  },
  targets:[
    {repo:'mongodb-developer/mongodb-express-rest-api-example',commit:'e9a5b28cce95d04b73f2c74031fe08abbdedde74'},
    {repo:'umagol/nodejs-postgresql',commit:'7d3e10e0086afda6310c554c4bb5a02927fcb66a'},
    {repo:'fastify/demo',commit:'5cd560125b3c2f0d42192bc7f493e8e3b9e75e52'},
    {repo:'rwieruch/node-express-postgresql-server',commit:'90b1b4c08323510cede1cbf749289b38aa7e7da4'}
  ]
};
