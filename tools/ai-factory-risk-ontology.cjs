'use strict';

const RISK_ONTOLOGY=[
  {
    axisId:'inventory.nonnegative-domain',
    label:'在庫・価格の非負領域整合性',
    signalGroups:[
      ['inventory','product','products'],
      ['quantity','stock'],
      ['price','value'],
      ['min="0"',"min='0'",'nonnegative','non-negative']
    ],
    minGroups:3,
    riskStatement:'在庫数量または価格が負数で保存され、UI上の非負制約と永続化層の契約が分裂する。',
    testHypothesis:'APIへ負のquantityまたはpriceを送信した場合、保存処理は拒否されるべきである。',
    oracle:'HTTP 4xxまたは同等のvalidation errorとなり、負数レコードが永続化されないこと。',
    tags:['numeric-domain','inventory','backend-validation']
  },
  {
    axisId:'resource.capacity-conservation',
    label:'予約容量保存則',
    signalGroups:[
      ['booking','reservation'],
      ['capacity'],
      ['available_seats','available seats','remaining'],
      ['number_of_seats','seats']
    ],
    minGroups:4,
    riskStatement:'予約操作によって残容量が増加する、または0未満になる入力が受理され、資源容量の保存則が破られる。',
    testHypothesis:'正の容量を持つ資源に対し、0以下の予約量は拒否され、成功した予約後の残容量は増加してはならない。',
    oracle:'number_of_seats <= 0 が拒否され、成功予約後 available_seats_after <= available_seats_before かつ >= 0 であること。',
    tags:['resource-accounting','booking','domain-invariant']
  },
  {
    axisId:'concurrency.overcommit-atomicity',
    label:'同時予約オーバーコミット原子性',
    signalGroups:[
      ['booking','reservation'],
      ['capacity','available_seats','available seats'],
      ['transaction','begin exclusive','begin immediate','lock','atomic'],
      ['concurrent','race condition','overbooking','overcommit']
    ],
    minGroups:3,
    riskStatement:'同時予約時に残容量の確認と予約確定が分離し、容量超過が発生する。',
    testHypothesis:'残容量を超える競合予約を同時送信しても、確定合計は容量を超えてはならない。',
    oracle:'競合要求の一部が拒否され、確定された予約量の合計がcapacity以下であること。',
    tags:['concurrency','atomicity','booking']
  },
  {
    axisId:'state.transition-validity',
    label:'業務状態遷移妥当性',
    signalGroups:[
      ['status','state'],
      ['cancel','return','checkout','approve','confirm'],
      ['booking','reservation','rental','loan']
    ],
    minGroups:3,
    riskStatement:'許可されていない状態遷移や終了済み状態からの再遷移が受理される。',
    testHypothesis:'状態遷移は明示された遷移表に含まれる場合のみ成功すべきである。',
    oracle:'不正遷移は拒否され、保存済み状態が変更されないこと。',
    tags:['state-machine','workflow']
  }
];

module.exports={RISK_ONTOLOGY};
