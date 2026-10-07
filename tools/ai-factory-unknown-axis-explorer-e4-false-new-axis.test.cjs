'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {exploreUnknownAxes}=require('./ai-factory-unknown-axis-explorer.cjs');

test('P7-E4-A1 PostgreSQL parameter binding must not become structural-input NEW-axis candidate',()=>{
  const project={files:[{
    path:'server.js',
    content:`
      app.get('/getuser/:id', (req, res) => {
        const id = parseInt(req.params.id);
        pool.query('SELECT * FROM users WHERE id = $1', [id], (err, results) => {
          res.status(200).send(results.rows);
        });
      });
    `
  }]};
  const out=exploreUnknownAxes(project);
  assert.equal(out.candidates.length,0);
});

test('P7-E4-A2 structural interpolation remains detectable',()=>{
  const project={files:[{
    path:'server.js',
    content:`
      app.get('/getuser/:id', (req, res) => {
        const id = req.params.id;
        pool.query(\`SELECT * FROM users WHERE id = \${id}\`, (err, results) => {
          res.status(200).send(results.rows);
        });
      });
    `
  }]};
  const out=exploreUnknownAxes(project);
  assert.equal(out.candidates.length,1);
  assert.equal(out.candidates[0].axisId,'boundary.structural-input-separation');
});
