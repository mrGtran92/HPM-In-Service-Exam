/* ---------------------------------------------------------------------------
 * PILOT QUESTION BANK — TEMPORARY
 *
 * This file is a verbatim port of the 10 pilot items so Phase 0 can be verified
 * against the original behavior. It is NOT the long-term home for content.
 *
 * Phase 1 replaces this with the `Items` Google Sheet as the authoring surface.
 * Phase 2 replaces it at runtime with a server-sanitized fetch (api.loadForm()),
 * at which point `correct` / `rationale` stop being shipped to the browser and
 * this file is deleted.
 *
 * Known shape problems, fixed in Phase 1/2 (see plan, "Sheet schema"):
 *   - `correct` is a POSITIONAL INDEX. Reordering choices silently corrupts the
 *     key. Becomes a stable `correct_choice_id` ("a".."d").
 *   - `domain` is free text used as an object key; `domainClass` is maintained
 *     by hand alongside it. Becomes a validated enum with a derived class.
 * ------------------------------------------------------------------------- */

const QUESTIONS = [
  {id:1,domain:"Pain & symptom management",domainClass:"domain-pain",
  stem:"A 67-year-old man with metastatic prostate cancer and bone pain has been stable on oral oxycodone 20 mg every 12 hours plus 5 mg immediate-release oxycodone every 4 hours as needed. Over the past 24 hours he has used six breakthrough doses. His pain is 7/10 at rest. He has no nausea, sedation, or confusion. Renal and hepatic function are normal.",
  lead:"Which of the following is the most appropriate next step in pain management?",
  choices:["Add gabapentin 300 mg three times daily for presumed neuropathic component","Increase sustained-release oxycodone to 35 mg every 12 hours and maintain breakthrough dosing at 5 mg every 4 hours as needed","Increase sustained-release oxycodone to 50 mg every 12 hours and adjust breakthrough dose to 10 mg every 4 hours as needed","Rotate opioid to extended-release morphine 30 mg every 12 hours due to inadequate response to oxycodone"],
  correct:2,
  rationale:{key:"When a patient uses ≥4 breakthrough doses in 24 hours, the total daily opioid dose should be recalculated and the long-acting component increased. This patient used 6 × 5 mg = 30 mg in breakthrough doses plus 40 mg scheduled, totaling 70 mg/day. Increasing to 50 mg every 12 hours (100 mg/day) represents ~40% — within the recommended 25–50% upward titration range. The breakthrough dose should be 10–15% of the total daily dose.",
  distractors:[{label:"A",text:"Adding gabapentin is premature before optimizing the opioid dose in a patient tolerating opioids without adverse effects."},{label:"B",text:"Increasing to 35 mg every 12 hours is only a 12.5% increase in scheduled dosing, insufficient given six breakthrough uses."},{label:"D",text:"Opioid rotation is indicated for inadequate analgesia despite escalation or intolerable side effects — not as a first response when titration is available."}],
  ref:"Portenoy RK, Ahmed E. J Clin Oncol. 2014;32(16):1662-1670. UNIPAC 3."}},

  {id:2,domain:"Pain & symptom management",domainClass:"domain-pain",
  stem:"An 82-year-old woman with end-stage renal disease (GFR 8 mL/min), ischemic cardiomyopathy (EF 25%), and hip fracture pain is referred to palliative care. She is opioid-naive. Acetaminophen 650 mg every 6 hours provides minimal relief. Her ECG demonstrates a QTc of 480 ms. NSAIDs are contraindicated.",
  lead:"Which of the following opioids is most appropriate to initiate?",
  choices:["Morphine 2 mg by mouth every 4 hours as needed","Codeine 30 mg by mouth every 4 hours as needed","Fentanyl transdermal 12.5 mcg/hour patch every 72 hours","Hydromorphone 0.5 mg by mouth every 4 hours as needed"],
  correct:3,
  rationale:{key:"Hydromorphone's principal metabolite (H3G) has minimal clinical activity and does not accumulate to toxic levels in renal failure, unlike morphine's M6G. Starting at 0.5 mg is appropriately conservative for an opioid-naive elderly patient.",
  distractors:[{label:"A",text:"Morphine's active metabolites (M6G, M3G) are renally cleared and accumulate in severe renal failure, causing sedation and respiratory depression. Avoid when GFR < 30 mL/min."},{label:"B",text:"Codeine is a prodrug converted to morphine; its active metabolites also accumulate in renal failure."},{label:"C",text:"Transdermal fentanyl is safe in renal failure but unsuitable for an opioid-naive patient with acute pain: 12–17 hour onset to therapeutic levels, cannot be rapidly titrated."}],
  ref:"Dean M. J Pain Symptom Manage. 2004;28(5):497-504. UNIPAC 3."}},

  {id:3,domain:"Non-pain symptom management",domainClass:"domain-nonsymptom",
  stem:"A 71-year-old man with advanced COPD on home hospice is evaluated for worsening dyspnea. He is on 2 L/min supplemental oxygen with resting SaO₂ of 94%. His regimen includes tiotropium, fluticasone/salmeterol, and as-needed albuterol nebulization used four times daily this past week. He recently completed systemic corticosteroids for an exacerbation. He rates dyspnea 8/10 at rest.",
  lead:"Which of the following is the most appropriate next step in management?",
  choices:["Initiate low-dose oral morphine 2.5 mg every 4 hours as needed","Increase supplemental oxygen to 4 L/min targeting SaO₂ above 96%","Restart systemic prednisone 40 mg daily","Add scheduled albuterol nebulization every 2 hours"],
  correct:0,
  rationale:{key:"Low-dose opioids are the most evidence-based intervention for refractory dyspnea in end-stage COPD. Multiple randomized trials demonstrate low-dose oral morphine reduces the subjective sensation of breathlessness without clinically meaningful respiratory depression at appropriate doses.",
  distractors:[{label:"B",text:"SaO₂ is already 94%. Increasing oxygen does not reliably improve dyspnea in normooxic COPD patients and may suppress hypoxic drive."},{label:"C",text:"Restarting steroids without evidence of new exacerbation is not appropriate and carries additional systemic side-effect risk."},{label:"D",text:"Scheduled every-2-hour albuterol substantially increases cardiac side effects without evidence of benefit in refractory end-stage dyspnea."}],
  ref:"Currow DC, et al. J Pain Symptom Manage. 2011;42(3):388-399. UNIPAC 4."}},

  {id:4,domain:"Non-pain symptom management",domainClass:"domain-nonsymptom",
  stem:"A 58-year-old woman with pancreatic cancer develops agitated delirium on your inpatient palliative care unit. She is non-verbal and pulling at her IV lines. You have already corrected hyponatremia (Na now 138), discontinued dexamethasone, and treated urinary retention. She remains agitated.",
  lead:"Which of the following is the most appropriate pharmacologic intervention at this time?",
  choices:["Lorazepam 1 mg intravenously every 4 hours as needed","Haloperidol 0.5–1 mg by mouth or intravenously every 4–6 hours as needed","Quetiapine 50 mg by mouth twice daily","Diphenhydramine 25 mg intravenously every 6 hours as needed"],
  correct:1,
  rationale:{key:"Haloperidol is the first-line agent for delirium in palliative care per ASCO and NCCN guidelines. It is effective for hyperactive delirium, available in IV/SQ/PO, and at low doses allows titration with a favorable side-effect profile.",
  distractors:[{label:"A",text:"Benzodiazepines can paradoxically worsen delirium. Reserved for alcohol/benzo withdrawal delirium or refractory cases near end of life."},{label:"C",text:"Quetiapine has slower onset and no IV form — suboptimal for acute agitated delirium requiring rapid titration."},{label:"D",text:"Diphenhydramine is a well-documented cause of delirium due to its anticholinergic properties. It would worsen this patient's condition."}],
  ref:"Bush SH, et al. J Pain Symptom Manage. 2014;48(2):231-248."}},

  {id:5,domain:"Communication & goals of care",domainClass:"domain-comms",
  stem:"A 64-year-old woman with stage IV non-small cell lung cancer is hospitalized with pneumonia. After treatment she recovers to baseline. Her oncologist has told her cancer is progressing and she is not a candidate for further chemotherapy. You meet with her and her adult daughter to discuss goals of care. After an illness understanding check, the patient states: \"I know things aren't going well, but I'm just not ready to give up hope.\"",
  lead:"Which of the following responses best demonstrates evidence-based serious illness communication?",
  choices:["\"I understand. Let's focus on your treatment options and come back to this conversation when you're ready.\"","\"Hoping for the best is something I encourage. What's most important to you as you think about the time ahead?\"","\"It's important that you understand that further chemotherapy is not an option, so we need to discuss hospice today.\"","\"Hope is very important. I also want to make sure we're planning for different possibilities — can we talk about what a difficult time might look like for you?\""],
  correct:3,
  rationale:{key:"This response uses the validated 'hope for the best, prepare for the worst' framework. It acknowledges and preserves hope while opening space to plan for a range of outcomes — without false reassurance or premature confrontation.",
  distractors:[{label:"A",text:"Deferring fails the patient and misses a critical window when she is alert and able to participate in planning."},{label:"B",text:"Pivoting to a values question without first acknowledging the emotional content of her statement skips a required empathic step."},{label:"C",text:"Directing her to hospice without exploring her values is inconsistent with evidence-based shared decision-making and may close off the conversation."}],
  ref:"Bernacki RE, Block SD. JAMA Intern Med. 2014;174(12):1994-2003. Ariadne Labs Serious Illness Conversation Guide."}},

  {id:6,domain:"Communication & goals of care",domainClass:"domain-comms",
  stem:"A 78-year-old man with advanced heart failure is hospitalized for his fourth admission in six months. He has moderate dementia and cannot articulate his own preferences. His wife, who holds his healthcare proxy, insists that \"everything should be done\" and becomes tearful and angry when the team raises goals of care. There is no advance directive on file.",
  lead:"Which of the following best reflects the appropriate ethical and legal framework for this situation?",
  choices:["The surrogate's expressed wishes must be followed in full, as she holds the legal authority to make all medical decisions.","The team should defer all goals-of-care discussions until the patient's cognitive status improves.","The surrogate is ethically obligated to apply a substituted judgment standard, basing decisions on what the patient would have wanted.","In the absence of an advance directive, state law requires the hospital ethics committee to determine the plan of care."],
  correct:2,
  rationale:{key:"The substituted judgment standard requires surrogates to replicate the decision the patient would have made based on his known values and prior statements — not the surrogate's own preferences.",
  distractors:[{label:"A",text:"Proxy authority is not unlimited. The surrogate is obligated to exercise it in service of the patient's known preferences, not her own wishes."},{label:"B",text:"Indefinite deferral in a patient with HF trajectory leaves him without a plan and exposed to unwanted interventions."},{label:"D",text:"Ethics committee involvement is not required by default when an advance directive is absent. The surrogate remains the decision-maker."}],
  ref:"Buchanan AE, Brock DW. Deciding for Others. Cambridge University Press, 1989."}},

  {id:7,domain:"Hospice eligibility & prognostication",domainClass:"domain-hospice",
  stem:"A 74-year-old woman with non-Hodgkin lymphoma, end-stage renal disease on hemodialysis, and hypertension is hospitalized with declining functional status. She requires assistance with bathing and dressing, has lost 12 pounds over 3 months, and wishes to discontinue hemodialysis and pursue comfort-focused care. The nephrology team estimates survival of 7–14 days after dialysis cessation. Her oncologist estimates her cancer prognosis at 4–5 months.",
  lead:"Which of the following best describes her hospice eligibility?",
  choices:["She is not eligible for hospice because her cancer prognosis exceeds six months.","She is eligible for hospice, and dialysis must be discontinued prior to enrollment.","She is eligible for hospice based on her renal disease prognosis after dialysis withdrawal, and enrollment can proceed.","She requires a hospice-specific prognostic tool score below a defined threshold before enrollment can be approved."],
  correct:2,
  rationale:{key:"When a patient voluntarily withdraws from life-sustaining treatment, prognosis is assessed based on the expected course after that decision — 7–14 days, well within the six-month threshold. Dialysis does not need to be discontinued before enrollment.",
  distractors:[{label:"A",text:"The cancer prognosis alone does not determine eligibility when a co-existing terminal condition meets the threshold. Either diagnosis may be used for certification."},{label:"B",text:"Requiring pre-enrollment discontinuation of dialysis is inconsistent with Medicare hospice regulations."},{label:"D",text:"No specific prognostic tool score is required for enrollment. Certification is based on clinical judgment."}],
  ref:"Medicare Benefit Policy Manual, Chapter 9. 42 CFR §418.22."}},

  {id:8,domain:"Hospice eligibility & prognostication",domainClass:"domain-hospice",
  stem:"A 69-year-old man with Alzheimer's dementia is brought to clinic. He no longer recognizes his wife, is incontinent of bowel and bladder, cannot ambulate without full assistance, and speaks only a few intelligible words. He has had three hospitalizations for aspiration pneumonia in the past year and has a BMI of 17.4 with 8-pound weight loss over 6 months.",
  lead:"Which of the following is correct regarding this patient's hospice eligibility?",
  choices:["He does not meet hospice eligibility criteria because his functional decline may stabilize.","He meets FAST Stage 7C criteria and is eligible for hospice with dementia as the terminal diagnosis if he has had at least one dementia-related complication in the past 12 months.","He requires a Mini-Mental State Examination score of 10 or below to qualify for hospice under the dementia LCD.","He is eligible for hospice only if his primary care physician certifies that death is imminent within 30 days."],
  correct:1,
  rationale:{key:"Medicare's LCD for dementia requires FAST Stage 7 criteria and at least one qualifying complication in the prior 12 months — including aspiration pneumonia, UTI, septicemia, or significant weight loss. This patient meets multiple criteria.",
  distractors:[{label:"A",text:"Potential stabilization does not disqualify a patient. Advanced dementia is terminal and stabilization at this functional level does not preclude a six-month prognosis."},{label:"C",text:"The MMSE is not a required component of the dementia LCD. The FAST staging system is the functional framework used."},{label:"D",text:"Hospice certification requires a prognosis of six months or less, not 30 days or less."}],
  ref:"Medicare LCD for Hospice: Determining Terminal Prognosis (L33393). Reisberg B. Psychopharmacol Bull. 1988;24(4):653-659."}},

  {id:9,domain:"Ethics & law",domainClass:"domain-ethics",
  stem:"A 55-year-old man with glioblastoma multiforme is admitted with his third seizure in a week. He is alert and oriented between seizures. He states clearly that he does not want resuscitation and does not want to be kept alive on machines. His wife, who is his legally designated healthcare proxy, insists he be a full code, stating he is 'not thinking clearly.' The team's neurologic assessment documents that the patient has decisional capacity for this decision.",
  lead:"Which of the following reflects the most appropriate course of action?",
  choices:["Defer to the wife's wishes, as she is the legally designated healthcare proxy.","Request a formal psychiatric capacity evaluation before acting on the patient's stated preferences.","Honor the patient's documented preferences, as a capacitated patient's autonomous decisions take precedence over surrogate authority.","Convene the ethics committee to adjudicate between the patient's and surrogate's conflicting preferences."],
  correct:2,
  rationale:{key:"A patient with documented decisional capacity has the absolute right to refuse any medical intervention. Surrogate authority is activated only when a patient lacks capacity. The wife's proxy authority is suspended while the patient has capacity.",
  distractors:[{label:"A",text:"Proxy authority is not active when a patient has decision-making capacity. Deferring to the wife would violate the patient's autonomy and legal right to informed refusal."},{label:"B",text:"Referring to psychiatry because the surrogate disagrees instrumentalizes the evaluation to override an autonomous decision — ethically problematic."},{label:"D",text:"Ethics committee consultation is for genuine dilemmas, not for cases where the clinical and legal answer is clear."}],
  ref:"Appelbaum PS. N Engl J Med. 2007;357(18):1834-1840. Cruzan v. Director, 497 U.S. 261 (1990)."}},

  {id:10,domain:"Psychosocial & spiritual care",domainClass:"domain-psych",
  stem:"A 48-year-old woman with metastatic breast cancer reports feeling profoundly disconnected from her sense of self since her diagnosis — she no longer finds meaning in activities she previously loved, feels like a different person, and fears she will be forgotten after her death. She denies depressed mood, anhedonia, vegetative symptoms, hopelessness, or suicidal ideation. Her PHQ-9 is 4/16. She asks whether medication would help.",
  lead:"Which of the following is the most appropriate response?",
  choices:["Initiate sertraline 50 mg daily, as her symptoms are consistent with a subthreshold depressive disorder.","Refer her to a psychologist or trained clinician for Meaning-Centered Psychotherapy, an evidence-based intervention for existential distress in advanced cancer.","Reassure her that these feelings are expected in the context of serious illness and recommend follow-up in 3 months.","Refer for chaplaincy services only, as her symptoms are spiritual in nature and outside the scope of medical management."],
  correct:1,
  rationale:{key:"This patient describes existential distress — loss of identity, meaning, and legacy — distinct from major depression. Meaning-Centered Psychotherapy (MCP) has RCT evidence for improvement in spiritual well-being and reductions in existential distress in advanced cancer.",
  distractors:[{label:"A",text:"This patient does not meet criteria for a depressive disorder. Her PHQ-9 is below threshold and she denies all core depressive symptoms."},{label:"C",text:"Existential distress is not self-limited in advanced cancer and is associated with impaired quality of life. Active intervention is indicated."},{label:"D",text:"Chaplaincy is important but limiting the referral to chaplaincy alone ignores available psychologically-based evidence-based interventions."}],
  ref:"Breitbart W, et al. Psychooncology. 2010;19(1):21-28. Cancer. 2018;124(15):3231-3239."}},
];
