'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {exploreUnknownAxes}=require('./ai-factory-unknown-axis-explorer.cjs');

const repos={
  bezkoder:{
    files:[
      {
        path:'app/controllers/tutorial.controller.js',
        content:`
exports.findAll = (req, res) => {
  const title = req.query.title;
  Tutorial.getAll(title, (err, data) => res.send(data));
};
`
      },
      {
        path:'app/models/tutorial.model.js',
        content:`
Tutorial.create = (newTutorial, result) => {
  sql.query("INSERT INTO tutorials SET ?", newTutorial, ()=>{});
};
Tutorial.findById = (id, result) => {
  sql.query(\`SELECT * FROM tutorials WHERE id = \${id}\`, ()=>{});
};
Tutorial.getAll = (title, result) => {
  let query = "SELECT * FROM tutorials";
  if (title) {
    query += \` WHERE title LIKE '%\${title}%'\`;
  }
  sql.query(query, ()=>{});
};
Tutorial.updateById = (id, tutorial, result) => {
  sql.query("UPDATE tutorials SET title = ? WHERE id = ?", [tutorial.title,id], ()=>{});
};
`
      }
    ]
  },
  sequelizeControl:{
    files:[
      {
        path:'api/controllers/UserController.js',
        content:`
const login = async (req,res) => {
  const { email, password } = req.body;
  const user = await User.findOne({where:{email}});
  return res.json({user});
};
`
      },
      {
        path:'api/models/User.js',
        content:`
const User = sequelize.define('User',{email:{type:Sequelize.STRING}});
`
      }
    ]
  },
  parameterizedControl:{
    files:[
      {
        path:'src/controllers/employee.controller.js',
        content:`
exports.getEmployeeByID=(req,res)=>{
  EmployeeModel.getEmployeeByID(req.params.id,(err,employee)=>res.send(employee));
};
`
      },
      {
        path:'src/models/employee.model.js',
        content:`
Employee.getEmployeeByID=(id,result)=>{
  dbConn.query('SELECT * FROM employees WHERE id=?',id,()=>{});
};
Employee.updateEmployee=(id,data,result)=>{
  dbConn.query("UPDATE employees SET first_name=? WHERE id = ?",[data.first_name,id],()=>{});
};
`
      }
    ]
  }
};

test('P7-E3-2 frozen external bezkoder structure must produce one candidate',()=>{
  const result=exploreUnknownAxes(repos.bezkoder);
  assert.equal(result.candidates.length,1,
    'Missed Risk: mixed parameterized and structural queries in one file caused a whole-file skip');
});

test('P7-E3-3 Sequelize ORM control must not produce structural-input candidate',()=>{
  const result=exploreUnknownAxes(repos.sequelizeControl);
  assert.equal(result.candidates.length,0);
});

test('P7-E3-4 parameterized SQL control must not produce structural-input candidate',()=>{
  const result=exploreUnknownAxes(repos.parameterizedControl);
  assert.equal(result.candidates.length,0);
});
