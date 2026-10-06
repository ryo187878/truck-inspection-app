#!/usr/bin/env node
'use strict';

async function request(url,options={}){
  const res=await fetch(url,{...options,headers:{'content-type':'application/json',...(options.headers||{})}});
  let body=null;
  try{body=await res.json();}catch{body=await res.text();}
  return {status:res.status,body};
}

async function probeInventory(base='http://127.0.0.1:3000'){
  const negative=await request(base+'/api/products',{
    method:'POST',
    body:JSON.stringify({name:'AI_FACTORY_NEGATIVE',category:'probe',quantity:-7,price:-3.5})
  });
  const list=await request(base+'/api/products?search=AI_FACTORY_NEGATIVE');
  const persisted=Array.isArray(list.body)&&list.body.some(x=>Number(x.quantity)<0||Number(x.price)<0);
  return {
    externalApp:'TheCandyLoop/inventory-management-crud',
    axisId:'boundary.server-domain-enforcement',
    outcome:(negative.status<400&&persisted)?'detected':'validated',
    evidenceId:'EXT-INVENTORY-NONNEGATIVE-20261006',
    observation:{createStatus:negative.status,persistedNegative:persisted,response:negative.body}
  };
}

async function probeBooking(base='http://127.0.0.1:3000'){
  const now=new Date();
  const plusDays=(n)=>{
    const d=new Date(now.getTime()+n*86400000);
    return d.toISOString().slice(0,10);
  };
  const eventDate=plusDays(30);
  const start=plusDays(1)+' 00:00:00';
  const end=plusDays(20)+' 23:59:59';
  const created=await request(base+'/events',{
    method:'POST',
    body:JSON.stringify({name:'AI FACTORY CAPACITY',event_date:eventDate,capacity:10,booking_started_at:start,booking_ended_at:end})
  });
  const eventId=created.body?.data?.id;
  if(!eventId) return {
    externalApp:'rizbud/express-sqlite-booking-system',
    axisId:'resource.consumption-sign-invariant',
    outcome:'inconclusive',
    evidenceId:'EXT-BOOKING-CAPACITY-20261006',
    observation:{eventCreate:created}
  };
  const before=await request(base+'/events/'+eventId);
  const booking=await request(base+'/events/'+eventId+'/booking',{
    method:'POST',
    body:JSON.stringify({name:'AI FACTORY NEGATIVE',email:'ai-factory-negative-'+Date.now()+'@example.invalid',number_of_seats:-3})
  });
  const after=await request(base+'/events/'+eventId);
  const beforeSeats=Number(before.body?.data?.available_seats);
  const afterSeats=Number(after.body?.data?.available_seats);
  const increased=Number.isFinite(beforeSeats)&&Number.isFinite(afterSeats)&&afterSeats>beforeSeats;
  return {
    externalApp:'rizbud/express-sqlite-booking-system',
    axisId:'resource.capacity-conservation',
    outcome:(booking.status<400&&increased)?'detected':'validated',
    evidenceId:'EXT-BOOKING-CAPACITY-20261006',
    observation:{eventId,beforeSeats,bookingStatus:booking.status,afterSeats,increased,bookingResponse:booking.body}
  };
}

async function main(){
  const mode=process.argv[2];
  const base=process.argv[3]||'http://127.0.0.1:3000';
  const result=mode==='inventory'?await probeInventory(base)
    :mode==='booking'?await probeBooking(base)
    :null;
  if(!result) throw new Error('Usage: node tools/ai-factory-external-probe.cjs inventory|booking [baseUrl]');
  console.log(JSON.stringify(result,null,2));
  if(result.outcome==='inconclusive') process.exitCode=2;
}

if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=2;});
}

module.exports={request,probeInventory,probeBooking};
