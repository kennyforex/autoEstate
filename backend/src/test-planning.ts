import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

dotenv.config();

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

// ═══════════════════════════════════════════════
// TEST 1: All prices from estimate_price.py
// ═══════════════════════════════════════════════
function testAllPrices() {
  console.log('\n── Test 1: estimate_price.py (all vehicle × service) ──');
  const scriptPath = path.resolve(process.cwd(), 'uploads/skills/697460d7fbd1f7612d4845ed/car-wash-estimator/scripts/estimate_price.py');
  if (!fs.existsSync(scriptPath)) {
    console.log('  ⚠️  Script not found, skipping');
    return;
  }

  const PRICES: Record<string, Record<string, number>> = {
    motorcycle: { basic: 80, interior: 0, full: 200, engine: 60 },
    sedan:      { basic: 150, interior: 200, full: 580, engine: 120 },
    suv:        { basic: 200, interior: 280, full: 780, engine: 150 },
    truck:      { basic: 220, interior: 300, full: 850, engine: 180 },
    van:        { basic: 250, interior: 320, full: 900, engine: 180 },
  };

  for (const [vehicle, services] of Object.entries(PRICES)) {
    for (const [service, expectedPrice] of Object.entries(services)) {
      const output = execSync(`python3 "${scriptPath}" ${vehicle} ${service}`, { encoding: 'utf-8' });
      const result = JSON.parse(output);
      if (expectedPrice === 0) {
        assert(!!result.error, `${vehicle} ${service} → error (unavailable)`);
      } else {
        assert(result.total === expectedPrice, `${vehicle} ${service} → HKD ${expectedPrice}`, `got ${result.total}`);
      }
    }
  }

  // Multi-service discount
  const multi = [
    { args: 'suv basic,interior', total: 432 },
    { args: 'sedan basic,engine', total: 243 },
  ];
  for (const tc of multi) {
    const output = execSync(`python3 "${scriptPath}" ${tc.args}`, { encoding: 'utf-8' });
    const result = JSON.parse(output);
    assert(result.total === tc.total, `multi ${tc.args} → HKD ${tc.total}`, `got ${result.total}`);
  }
}

// ═══════════════════════════════════════════════
// TEST 2: Frontmatter parsing
// ═══════════════════════════════════════════════
async function testFrontmatter() {
  console.log('\n── Test 2: parseSkillFrontmatter ──');
  const { parseSkillFrontmatter } = await import('./services/skill.service.js');

  const cw = parseSkillFrontmatter(fs.readFileSync(path.resolve(process.cwd(), 'skills/car-wash-estimator/SKILL.md'), 'utf-8'));
  assert(cw.steps.length === 3, `car-wash steps = ${cw.steps.length}`);
  assert(cw.steps[0].collects === 'vehicle_type', `step[0].collects = ${cw.steps[0].collects}`);

  const cb = parseSkillFrontmatter(fs.readFileSync(path.resolve(process.cwd(), 'skills/car-booking.md'), 'utf-8'));
  assert(cb.steps.length === 5, `car-booking steps = ${cb.steps.length}`);
  assert(cb.steps[3].collects === 'phone_number', `step[3].collects = ${cb.steps[3].collects}`);

  const noSteps = parseSkillFrontmatter('---\nname: X\ndescription: Y\n---\nBody');
  assert(noSteps.steps.length === 0, `no-steps skill = ${noSteps.steps.length}`);
}

// ═══════════════════════════════════════════════
// TEST 3: Router — structural decisions only
// ═══════════════════════════════════════════════
async function testRouter() {
  console.log('\n── Test 3: Router logic ──');
  const { routeIntent } = await import('./agent/router.js');

  const skills = [
    { name: 'CWE', slug: 'car-wash-estimator', description: 'Price estimates', triggerHints: ['price'], hasReferences: false, hasExamples: false, availableScripts: ['estimate_price.py'], storagePath: '', requiredTools: [] },
    { name: 'CSB', slug: 'car-service-booking', description: 'Booking', triggerHints: ['book'], hasReferences: false, hasExamples: false, availableScripts: [], storagePath: '', requiredTools: [] },
  ];
  const base: any = {
    conversationId: 't', assistantId: 't', channelId: 't',
    contact: { id: 't' },
    assistant: { id: 't', name: 'T', primaryLanguage: 'en', tone: 'friendly', model: 't', pineconeAssistantName: '' },
    skills,
  };

  // 3a: New request → force_skill (LLM classifier picks skill)
  const r1 = await routeIntent({ ...base, messageHistory: [{ role: 'user', content: 'how much for SUV wash?' }], goalStack: { goals: [], activeGoalId: null } }, 'how much for SUV wash?');
  assert(r1.action === 'force_skill' || r1.action === 'llm_decide', 'new pricing request → force_skill or llm_decide');

  // 3b: Active skill conversation → suggest (continue)
  const r2 = await routeIntent({
    ...base,
    messageHistory: [
      { role: 'user', content: 'how much?' },
      { role: 'assistant', content: 'What vehicle?\n<!-- skill:car-wash-estimator -->' },
      { role: 'user', content: 'SUV' },
    ],
    goalStack: { goals: [{ id: 'g1', skillSlug: 'car-wash-estimator', status: 'active', observations: {}, createdAt: Date.now() }], activeGoalId: 'g1' },
  }, 'SUV');
  assert(r2.action === 'suggest_skill' && (r2 as any).slug === 'car-wash-estimator', 'mid-flow → suggest same skill', JSON.stringify(r2));

  // 3c: Skill just completed → force_skill or llm_decide (LLM classifier picks booking)
  const r3 = await routeIntent({
    ...base,
    messageHistory: [
      { role: 'assistant', content: 'HKD 200\n<!-- skill:car-wash-estimator:complete {"price":"200"} -->' },
      { role: 'user', content: 'now book it for me' },
    ],
    goalStack: { goals: [{ id: 'g1', skillSlug: 'car-wash-estimator', status: 'completed', observations: { price: '200' }, createdAt: Date.now(), completedAt: Date.now() }], activeGoalId: null },
  }, 'now book it for me');
  assert(r3.action === 'force_skill' || r3.action === 'llm_decide', 'after completion + new intent → force_skill or llm_decide', JSON.stringify(r3));

  // 3d: Suspended goal after completion → force resume
  const r4 = await routeIntent({
    ...base,
    messageHistory: [
      { role: 'assistant', content: 'Done!\n<!-- skill:car-wash-estimator:complete {} -->' },
      { role: 'user', content: 'ok' },
    ],
    goalStack: {
      goals: [
        { id: 'g1', skillSlug: 'car-service-booking', status: 'suspended', observations: {}, createdAt: Date.now() - 10000, suspendedAt: Date.now() - 5000 },
        { id: 'g2', skillSlug: 'car-wash-estimator', status: 'completed', observations: {}, createdAt: Date.now() - 5000, completedAt: Date.now() },
      ],
      activeGoalId: null,
    },
  }, 'ok');
  assert(r4.action === 'force_skill' && (r4 as any).slug === 'car-service-booking', 'suspended goal → force resume after completion', JSON.stringify(r4));

  // 3e: Greeting message → force_skill or llm_decide (LLM classifier may match greeting-handler)
  const r5 = await routeIntent({ ...base, messageHistory: [{ role: 'user', content: 'hi there!' }], goalStack: { goals: [], activeGoalId: null } }, 'hi there!');
  assert(r5.action === 'force_skill' || r5.action === 'llm_decide', 'greeting → force_skill or llm_decide');

  // 3f: Pricing question → force_skill or llm_decide (LLM classifier may match estimator)
  const r6 = await routeIntent({ ...base, messageHistory: [{ role: 'user', content: "what's the price of washing a car?" }], goalStack: { goals: [], activeGoalId: null } }, "what's the price of washing a car?");
  assert(r6.action === 'force_skill' || r6.action === 'llm_decide', '"washing price" → force_skill or llm_decide');
}

// ═══════════════════════════════════════════════
// TEST 4: Fabrication guard patterns
// ═══════════════════════════════════════════════
function testFabricationGuard() {
  console.log('\n── Test 4: Fabrication guard regex ──');
  const p = /(?:HKD|USD|\$)\s*\d+/i;
  assert(p.test('Interior cleaning: HKD 280'), 'catches HKD 280');
  assert(p.test('Total: $150'), 'catches $150');
  assert(!p.test('What vehicle do you have?'), 'no false positive on question');
  assert(!p.test('Choose: basic, interior, full'), 'no false positive on options');
}

// ═══════════════════════════════════════════════
// TEST 5: ConversationState — full lifecycle
// ═══════════════════════════════════════════════
async function testConversationStateLifecycle() {
  console.log('\n── Test 5: ConversationState lifecycle ──');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autoEstate');
  const { conversationStateService } = await import('./services/conversationState.service.js');
  const { ConversationState } = await import('./models/ConversationState.js');
  const id = new mongoose.Types.ObjectId().toString();

  try {
    // Empty
    assert((await conversationStateService.load(id)) === null, 'empty → null');

    // Activate car-wash-estimator with steps
    const s1 = await conversationStateService.activateGoal(id, 'car-wash-estimator', [
      { id: 'vehicle', label: 'Vehicle type', collects: 'vehicle_type' },
      { id: 'service', label: 'Wash package', collects: 'wash_package' },
      { id: 'estimate', label: 'Price estimate', collects: 'estimated_price' },
    ]);
    assert(s1.goals.length === 1 && s1.goals[0].status === 'active', 'car-wash active');
    assert(s1.goals[0].steps![0].status === 'active', 'step 1 active');

    // Collect vehicle
    await conversationStateService.updateStepProgress(id, 'car-wash-estimator', { vehicle_type: 'SUV' });
    const s2 = (await conversationStateService.load(id))!;
    assert(s2.goals[0].steps![0].status === 'completed', 'step 1 completed');
    assert(s2.goals[0].steps![0].collectedValue === 'SUV', 'collected SUV');
    assert(s2.goals[0].steps![1].status === 'active', 'step 2 active');

    // Collect service
    await conversationStateService.updateStepProgress(id, 'car-wash-estimator', { wash_package: 'interior' });
    const s3 = (await conversationStateService.load(id))!;
    assert(s3.goals[0].steps![1].status === 'completed', 'step 2 completed');
    assert(s3.goals[0].steps![2].status === 'active', 'step 3 active');

    // Complete car-wash
    await conversationStateService.completeGoal(id, 'car-wash-estimator', { vehicle_type: 'SUV', wash_package: 'interior', estimated_price: 'HKD 280' });
    const s4 = (await conversationStateService.load(id))!;
    assert(s4.goals[0].status === 'completed', 'car-wash completed');
    assert(s4.activeGoalId === null, 'no active goal');

    console.log('  -- Multi-goal scenario --');

    // Reactivate car-wash (new request after completion)
    const s5 = await conversationStateService.activateGoal(id, 'car-wash-estimator', [
      { id: 'vehicle', label: 'Vehicle type', collects: 'vehicle_type' },
    ]);
    assert(s5.goals.length === 2, 'two goals (old completed + new active)');
    assert(s5.goals[0].status === 'completed', 'old goal still completed');
    assert(s5.goals[1].status === 'active', 'new goal active');

    console.log('  -- Goal suspension (skill A → skill B → resume A) --');
    const id2 = new mongoose.Types.ObjectId().toString();

    // Start car-wash-estimator
    const m1 = await conversationStateService.activateGoal(id2, 'car-wash-estimator', [
      { id: 'vehicle', label: 'Vehicle', collects: 'vehicle_type' },
      { id: 'service', label: 'Service', collects: 'wash_package' },
    ]);
    assert(m1.goals.length === 1 && m1.goals[0].status === 'active', 'A: car-wash active');

    // Collect vehicle
    await conversationStateService.updateStepProgress(id2, 'car-wash-estimator', { vehicle_type: 'truck' });

    // Mid-flow: user switches to booking → car-wash gets suspended
    const m2 = await conversationStateService.activateGoal(id2, 'car-service-booking', [
      { id: 'service', label: 'Service type', collects: 'service_type' },
      { id: 'vehicle', label: 'Vehicle details', collects: 'vehicle_details' },
      { id: 'datetime', label: 'Date/time', collects: 'preferred_datetime' },
      { id: 'phone', label: 'Phone', collects: 'phone_number' },
      { id: 'confirm', label: 'Confirm', collects: undefined },
    ]);
    assert(m2.goals[0].status === 'suspended', 'A: car-wash SUSPENDED when booking started');
    assert(m2.goals[0].steps![0].status === 'completed', 'A: car-wash step 1 still completed (preserved)');
    assert(m2.goals[0].steps![0].collectedValue === 'truck', 'A: car-wash collected value preserved');
    assert(m2.goals[1].status === 'active', 'B: booking ACTIVE');
    assert(m2.activeGoalId === m2.goals[1].id, 'activeGoalId → booking');

    // Progress booking
    await conversationStateService.updateStepProgress(id2, 'car-service-booking', { service_type: 'full detail' });
    await conversationStateService.updateStepProgress(id2, 'car-service-booking', { vehicle_details: 'Ford F-150 2022' });
    await conversationStateService.updateStepProgress(id2, 'car-service-booking', { preferred_datetime: 'Monday 10am' });
    await conversationStateService.updateStepProgress(id2, 'car-service-booking', { phone_number: '98765432' });

    const m3 = (await conversationStateService.load(id2))!;
    const bookingGoal = m3.goals[1];
    assert(bookingGoal.steps!.filter(s => s.status === 'completed').length === 4, 'B: 4 booking steps completed');
    assert(bookingGoal.observations.service_type === 'full detail', 'B: observation preserved');
    assert(bookingGoal.observations.phone_number === '98765432', 'B: phone collected');

    // Complete booking → car-wash should become promotable
    const m4 = await conversationStateService.completeGoal(id2, 'car-service-booking', {
      service_type: 'full detail', vehicle_details: 'Ford F-150 2022',
      preferred_datetime: 'Monday 10am', phone_number: '98765432',
    });
    assert(m4.goals[1].status === 'completed', 'B: booking COMPLETED');
    // activeGoalId should now point to the suspended car-wash or null
    // (our service sets it to null since no auto-promotion — router handles that)

    // Reactivate suspended car-wash (router would call this)
    const m5 = await conversationStateService.activateGoal(id2, 'car-wash-estimator');
    const resumed = m5.goals.find(g => g.skillSlug === 'car-wash-estimator' && g.status === 'active');
    assert(!!resumed, 'A: car-wash RESUMED after booking completed');
    assert(resumed!.steps![0].status === 'completed', 'A: car-wash step 1 still completed after resume');
    assert(resumed!.steps![0].collectedValue === 'truck', 'A: car-wash step 1 value preserved after resume');
    assert(resumed!.steps![1].status === 'pending' || resumed!.steps![1].status === 'active', 'A: car-wash step 2 ready');

    // Clean up
    await ConversationState.deleteMany({ conversationId: { $in: [id, id2] } });
  } finally {
    await mongoose.disconnect();
    console.log('  Cleaned up & disconnected');
  }
}

// ═══════════════════════════════════════════════
// TEST 6: Scenario — estimate → booking handoff (router)
// ═══════════════════════════════════════════════
async function testEstimateToBookingHandoff() {
  console.log('\n── Test 6: Estimate → Booking handoff scenario ──');
  const { routeIntent } = await import('./agent/router.js');

  const skills = [
    { name: 'CWE', slug: 'car-wash-estimator', description: 'Estimates', triggerHints: ['price'], hasReferences: false, hasExamples: false, availableScripts: ['estimate_price.py'], storagePath: '', requiredTools: [] },
    { name: 'CSB', slug: 'car-service-booking', description: 'Booking', triggerHints: ['book'], hasReferences: false, hasExamples: false, availableScripts: [], storagePath: '', requiredTools: [] },
  ];
  const base: any = {
    conversationId: 't', assistantId: 't', channelId: 't',
    contact: { id: 't' },
    assistant: { id: 't', name: 'T', primaryLanguage: 'en', tone: 'friendly', model: 't', pineconeAssistantName: '' },
    skills,
  };

  // Step 1: User asks for price → force_skill (LLM classifier picks car-wash-estimator)
  const r1 = await routeIntent({
    ...base,
    messageHistory: [{ role: 'user', content: 'how much for SUV basic wash?' }],
    goalStack: { goals: [], activeGoalId: null },
  }, 'how much for SUV basic wash?');
  assert(r1.action === 'force_skill' || r1.action === 'llm_decide', 'S1: price question → force_skill or llm_decide');

  // Step 2: Skill active, user answers → suggest (continue)
  const r2 = await routeIntent({
    ...base,
    messageHistory: [
      { role: 'user', content: 'how much?' },
      { role: 'assistant', content: 'What vehicle?\n<!-- skill:car-wash-estimator -->' },
      { role: 'user', content: 'SUV, basic' },
    ],
    goalStack: { goals: [{ id: 'g1', skillSlug: 'car-wash-estimator', status: 'active', observations: {}, createdAt: Date.now() }], activeGoalId: 'g1' },
  }, 'SUV, basic');
  assert(r2.action === 'suggest_skill' && (r2 as any).slug === 'car-wash-estimator', 'S2: mid-flow → suggest estimator');

  // Step 3: Skill completed, user says "book it" → force_skill (LLM classifier picks booking)
  const r3 = await routeIntent({
    ...base,
    messageHistory: [
      { role: 'assistant', content: 'HKD 200. Book?\n<!-- skill:car-wash-estimator:complete {"price":"200"} -->' },
      { role: 'user', content: 'yes book it for me' },
    ],
    goalStack: {
      goals: [{ id: 'g1', skillSlug: 'car-wash-estimator', status: 'completed', observations: { price: '200' }, createdAt: Date.now(), completedAt: Date.now() }],
      activeGoalId: null,
    },
  }, 'yes book it for me');
  assert(r3.action === 'force_skill' || r3.action === 'llm_decide', 'S3: "book it" after estimate → force_skill or llm_decide');

  // Step 4: Booking active, user provides info → suggest booking
  const r4 = await routeIntent({
    ...base,
    messageHistory: [
      { role: 'assistant', content: 'What vehicle details?\n<!-- skill:car-service-booking -->' },
      { role: 'user', content: 'Toyota Camry 2020' },
    ],
    goalStack: {
      goals: [
        { id: 'g1', skillSlug: 'car-wash-estimator', status: 'completed', observations: { price: '200' }, createdAt: Date.now() - 5000, completedAt: Date.now() - 3000 },
        { id: 'g2', skillSlug: 'car-service-booking', status: 'active', observations: {}, createdAt: Date.now() },
      ],
      activeGoalId: 'g2',
    },
  }, 'Toyota Camry 2020');
  assert(r4.action === 'suggest_skill' && (r4 as any).slug === 'car-service-booking', 'S4: booking mid-flow → suggest booking');
}

// ═══════════════════════════════════════════════
// TEST 7: Scenario — mid-estimate switch to booking
// ═══════════════════════════════════════════════
async function testMidEstimateSwitchToBooking() {
  console.log('\n── Test 7: Mid-estimate switch to booking ──');
  const { routeIntent } = await import('./agent/router.js');

  const skills = [
    { name: 'CWE', slug: 'car-wash-estimator', description: 'Estimates', triggerHints: ['price'], hasReferences: false, hasExamples: false, availableScripts: ['estimate_price.py'], storagePath: '', requiredTools: [] },
    { name: 'CSB', slug: 'car-service-booking', description: 'Booking', triggerHints: ['book'], hasReferences: false, hasExamples: false, availableScripts: [], storagePath: '', requiredTools: [] },
  ];
  const base: any = {
    conversationId: 't', assistantId: 't', channelId: 't',
    contact: { id: 't' },
    assistant: { id: 't', name: 'T', primaryLanguage: 'en', tone: 'friendly', model: 't', pineconeAssistantName: '' },
    skills,
  };

  // Estimator is active (mid-flow asking for service type)
  // User says "actually, just book me a car wash"
  // The estimator skill's UNHANDLED_INTENT would fire → the engine re-routes
  // But from the router's perspective, the estimator is still active
  const r1 = await routeIntent({
    ...base,
    messageHistory: [
      { role: 'user', content: 'how much for wash?' },
      { role: 'assistant', content: 'What vehicle?\n<!-- skill:car-wash-estimator -->' },
      { role: 'user', content: 'actually just book me a wash' },
    ],
    goalStack: {
      goals: [{ id: 'g1', skillSlug: 'car-wash-estimator', status: 'active', observations: {}, createdAt: Date.now() }],
      activeGoalId: 'g1',
    },
  }, 'actually just book me a wash');
  assert(
    r1.action === 'suggest_skill' && (r1 as any).slug === 'car-wash-estimator',
    'S1: active skill → suggest (skill will detect UNHANDLED_INTENT internally)',
    JSON.stringify(r1),
  );

  // After UNHANDLED_INTENT, estimator completes, booking is now active
  // No suspended goals → suggest booking (active skill continuation)
  const r2 = await routeIntent({
    ...base,
    messageHistory: [
      { role: 'assistant', content: 'Booking started!\n<!-- skill:car-service-booking -->' },
      { role: 'user', content: 'Toyota Camry 2020' },
    ],
    goalStack: {
      goals: [
        { id: 'g1', skillSlug: 'car-wash-estimator', status: 'completed', observations: {}, createdAt: Date.now() - 5000, completedAt: Date.now() - 2000 },
        { id: 'g2', skillSlug: 'car-service-booking', status: 'active', observations: {}, createdAt: Date.now() },
      ],
      activeGoalId: 'g2',
    },
  }, 'Toyota Camry 2020');
  assert(
    r2.action === 'suggest_skill' && (r2 as any).slug === 'car-service-booking',
    'S2: booking now active → suggest booking',
    JSON.stringify(r2),
  );
}

// ═══════════════════════════════════════════════
// TEST 8: Scenario — booking suspended, resume after estimate
// ═══════════════════════════════════════════════
async function testSuspendedGoalResume() {
  console.log('\n── Test 8: Suspend booking → estimate → resume booking ──');
  const { routeIntent } = await import('./agent/router.js');

  const skills = [
    { name: 'CWE', slug: 'car-wash-estimator', description: 'Estimates', triggerHints: ['price'], hasReferences: false, hasExamples: false, availableScripts: ['estimate_price.py'], storagePath: '', requiredTools: [] },
    { name: 'CSB', slug: 'car-service-booking', description: 'Booking', triggerHints: ['book'], hasReferences: false, hasExamples: false, availableScripts: [], storagePath: '', requiredTools: [] },
  ];
  const base: any = {
    conversationId: 't', assistantId: 't', channelId: 't',
    contact: { id: 't' },
    assistant: { id: 't', name: 'T', primaryLanguage: 'en', tone: 'friendly', model: 't', pineconeAssistantName: '' },
    skills,
  };

  // Booking is suspended, estimate just completed → force resume booking
  const r1 = await routeIntent({
    ...base,
    messageHistory: [
      { role: 'assistant', content: 'HKD 200!\n<!-- skill:car-wash-estimator:complete {"price":"200"} -->' },
      { role: 'user', content: 'ok thanks' },
    ],
    goalStack: {
      goals: [
        { id: 'g1', skillSlug: 'car-service-booking', status: 'suspended', observations: { service_type: 'basic wash' }, createdAt: Date.now() - 20000, suspendedAt: Date.now() - 10000 },
        { id: 'g2', skillSlug: 'car-wash-estimator', status: 'completed', observations: { price: '200' }, createdAt: Date.now() - 10000, completedAt: Date.now() },
      ],
      activeGoalId: null,
    },
  }, 'ok thanks');
  assert(
    r1.action === 'force_skill' && (r1 as any).slug === 'car-service-booking',
    'suspended booking → force resume after estimate completes',
    JSON.stringify(r1),
  );

  // Two suspended goals, first one resumes
  const r2 = await routeIntent({
    ...base,
    messageHistory: [
      { role: 'assistant', content: 'Done!\n<!-- skill:car-wash-estimator:complete {} -->' },
      { role: 'user', content: 'ok' },
    ],
    goalStack: {
      goals: [
        { id: 'g0', skillSlug: 'greeting-handler', status: 'suspended', observations: {}, createdAt: Date.now() - 30000, suspendedAt: Date.now() - 15000 },
        { id: 'g1', skillSlug: 'car-service-booking', status: 'suspended', observations: {}, createdAt: Date.now() - 20000, suspendedAt: Date.now() - 10000 },
        { id: 'g2', skillSlug: 'car-wash-estimator', status: 'completed', observations: {}, createdAt: Date.now() - 10000, completedAt: Date.now() },
      ],
      activeGoalId: null,
    },
  }, 'ok');
  assert(
    r2.action === 'force_skill',
    'two suspended → force first suspended',
    JSON.stringify(r2),
  );
}

// ═══════════════════════════════════════════════
// TEST 9: Three-deep goal nesting (A → B → C → resume B → resume A)
// ═══════════════════════════════════════════════
async function testThreeDeepNesting() {
  console.log('\n── Test 9: Three-deep nesting (A→B→C→B→A) ──');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autoEstate');
  const { conversationStateService } = await import('./services/conversationState.service.js');
  const { ConversationState } = await import('./models/ConversationState.js');
  const id = new mongoose.Types.ObjectId().toString();

  try {
    // Start skill A (car-service-booking)
    const s1 = await conversationStateService.activateGoal(id, 'car-service-booking', [
      { id: 'service', label: 'Service type', collects: 'service_type' },
      { id: 'vehicle', label: 'Vehicle', collects: 'vehicle_details' },
      { id: 'datetime', label: 'Date', collects: 'preferred_datetime' },
    ]);
    assert(s1.goals.length === 1, 'A started: 1 goal');
    assert(s1.goals[0].status === 'active', 'A is active');

    // Progress A: collect service type
    await conversationStateService.updateStepProgress(id, 'car-service-booking', { service_type: 'interior wash' });

    // Mid-flow, user asks "how much would that cost?" → activate B (car-wash-estimator)
    const s2 = await conversationStateService.activateGoal(id, 'car-wash-estimator', [
      { id: 'vehicle', label: 'Vehicle', collects: 'vehicle_type' },
      { id: 'service', label: 'Service', collects: 'wash_package' },
      { id: 'estimate', label: 'Estimate', collects: 'estimated_price' },
    ]);
    assert(s2.goals[0].status === 'suspended', 'A SUSPENDED when B started');
    assert(s2.goals[0].steps![0].status === 'completed', 'A: step 1 preserved');
    assert(s2.goals[0].steps![0].collectedValue === 'interior wash', 'A: value preserved');
    assert(s2.goals[1].status === 'active', 'B is active');
    assert(s2.goals.length === 2, '2 goals total');

    // Progress B: collect vehicle type
    await conversationStateService.updateStepProgress(id, 'car-wash-estimator', { vehicle_type: 'SUV' });

    // Mid-B, user asks "wait what greetings do you have?" → activate C (greeting-handler)
    const s3 = await conversationStateService.activateGoal(id, 'greeting-handler', [
      { id: 'greet', label: 'Greeting', collects: 'greeting_type' },
    ]);
    assert(s3.goals[0].status === 'suspended', 'A still suspended');
    assert(s3.goals[1].status === 'suspended', 'B NOW SUSPENDED when C started');
    assert(s3.goals[1].steps![0].status === 'completed', 'B: step 1 preserved');
    assert(s3.goals[1].steps![0].collectedValue === 'SUV', 'B: value preserved');
    assert(s3.goals[2].status === 'active', 'C is active');
    assert(s3.goals.length === 3, '3 goals total');
    assert(s3.activeGoalId === s3.goals[2].id, 'activeGoalId → C');

    // Complete C (greeting-handler)
    const s4 = await conversationStateService.completeGoal(id, 'greeting-handler', { greeting_type: 'hello' });
    assert(s4.goals[2].status === 'completed', 'C completed');
    // activeGoalId should now point to first suspended (A)
    const nextAfterC = s4.activeGoalId;
    assert(nextAfterC !== null, 'there is a next goal after C completes');

    // Re-activate the suspended B (car-wash-estimator) — simulating router force_skill
    const s5 = await conversationStateService.activateGoal(id, 'car-wash-estimator');
    const bGoal = s5.goals.find(g => g.skillSlug === 'car-wash-estimator' && g.status === 'active');
    assert(!!bGoal, 'B reactivated');
    assert(bGoal!.steps![0].status === 'completed', 'B: step 1 still completed after reactivation');
    assert(bGoal!.steps![0].collectedValue === 'SUV', 'B: value still preserved');
    assert(bGoal!.steps![1].status === 'pending' || bGoal!.steps![1].status === 'active', 'B: step 2 ready');

    // Progress B: collect wash package + estimate
    await conversationStateService.updateStepProgress(id, 'car-wash-estimator', { wash_package: 'interior' });
    await conversationStateService.updateStepProgress(id, 'car-wash-estimator', { estimated_price: 'HKD 280' });

    // Complete B
    const s6 = await conversationStateService.completeGoal(id, 'car-wash-estimator', {
      vehicle_type: 'SUV', wash_package: 'interior', estimated_price: 'HKD 280',
    });
    assert(s6.goals[1].status === 'completed', 'B completed');
    // Now the suspended A should be promotable
    const nextAfterB = s6.activeGoalId;
    assert(nextAfterB !== null, 'there is a next goal after B completes');

    // Re-activate A (car-service-booking)
    const s7 = await conversationStateService.activateGoal(id, 'car-service-booking');
    const aGoal = s7.goals.find(g => g.skillSlug === 'car-service-booking' && g.status === 'active');
    assert(!!aGoal, 'A reactivated');
    assert(aGoal!.steps![0].status === 'completed', 'A: step 1 STILL completed after everything');
    assert(aGoal!.steps![0].collectedValue === 'interior wash', 'A: step 1 value STILL preserved');
    assert(aGoal!.steps![1].status === 'pending' || aGoal!.steps![1].status === 'active', 'A: step 2 ready to continue');

    // Complete A
    await conversationStateService.updateStepProgress(id, 'car-service-booking', { vehicle_details: 'SUV 2023' });
    await conversationStateService.updateStepProgress(id, 'car-service-booking', { preferred_datetime: 'Friday 2pm' });
    const s8 = await conversationStateService.completeGoal(id, 'car-service-booking', {
      service_type: 'interior wash', vehicle_details: 'SUV 2023', preferred_datetime: 'Friday 2pm',
    });
    assert(s8.goals[0].status === 'completed', 'A completed');
    assert(s8.goals.every(g => g.status === 'completed'), 'ALL 3 goals completed');
    assert(s8.activeGoalId === null, 'no active goal — all done');

    await ConversationState.deleteMany({ conversationId: id });
  } finally {
    await mongoose.disconnect();
    console.log('  Cleaned up & disconnected');
  }
}

// ═══════════════════════════════════════════════
// TEST 10: Router with three-deep nesting flow
// ═══════════════════════════════════════════════
async function testRouterThreeDeepNesting() {
  console.log('\n── Test 10: Router decisions during three-deep nesting ──');
  const { routeIntent } = await import('./agent/router.js');

  const skills = [
    { name: 'CSB', slug: 'car-service-booking', description: 'Booking', triggerHints: ['book'], hasReferences: false, hasExamples: false, availableScripts: [], storagePath: '', requiredTools: [] },
    { name: 'CWE', slug: 'car-wash-estimator', description: 'Pricing', triggerHints: ['price'], hasReferences: false, hasExamples: false, availableScripts: ['estimate_price.py'], storagePath: '', requiredTools: [] },
    { name: 'GH', slug: 'greeting-handler', description: 'Greetings', triggerHints: ['hi'], hasReferences: false, hasExamples: false, availableScripts: [], storagePath: '', requiredTools: [] },
  ];
  const base: any = {
    conversationId: 't', assistantId: 't', channelId: 't',
    contact: { id: 't' },
    assistant: { id: 't', name: 'T', primaryLanguage: 'en', tone: 'friendly', model: 't', pineconeAssistantName: '' },
    skills,
  };

  // Scenario: A(booking) active, B(estimator) started mid-flow → A suspended
  // B completes → router should force resume A
  const r1 = await routeIntent({
    ...base,
    messageHistory: [
      { role: 'assistant', content: 'HKD 280!\n<!-- skill:car-wash-estimator:complete {"price":"280"} -->' },
      { role: 'user', content: 'great, continue with my booking' },
    ],
    goalStack: {
      goals: [
        { id: 'g1', skillSlug: 'car-service-booking', status: 'suspended', observations: { service_type: 'interior' }, createdAt: Date.now() - 30000, suspendedAt: Date.now() - 15000 },
        { id: 'g2', skillSlug: 'car-wash-estimator', status: 'completed', observations: { price: '280' }, createdAt: Date.now() - 15000, completedAt: Date.now() },
      ],
      activeGoalId: null,
    },
  }, 'great, continue with my booking');
  assert(r1.action === 'force_skill' && (r1 as any).slug === 'car-service-booking', 'B complete → force resume A (booking)');

  // After A resumed and B completed, now C(greeting) completes → B(estimator) was also suspended
  // Router should force resume B first (first suspended)
  const r2 = await routeIntent({
    ...base,
    messageHistory: [
      { role: 'assistant', content: 'Hello!\n<!-- skill:greeting-handler:complete {} -->' },
      { role: 'user', content: 'ok' },
    ],
    goalStack: {
      goals: [
        { id: 'g1', skillSlug: 'car-service-booking', status: 'suspended', observations: {}, createdAt: Date.now() - 40000, suspendedAt: Date.now() - 30000 },
        { id: 'g2', skillSlug: 'car-wash-estimator', status: 'suspended', observations: {}, createdAt: Date.now() - 30000, suspendedAt: Date.now() - 20000 },
        { id: 'g3', skillSlug: 'greeting-handler', status: 'completed', observations: {}, createdAt: Date.now() - 20000, completedAt: Date.now() },
      ],
      activeGoalId: null,
    },
  }, 'ok');
  assert(r2.action === 'force_skill', 'C complete → force resume first suspended');

  // No skills → always llm_decide
  const r3 = await routeIntent({
    ...base,
    skills: [],
    messageHistory: [{ role: 'user', content: 'hello' }],
    goalStack: { goals: [], activeGoalId: null },
  }, 'hello');
  assert(r3.action === 'llm_decide', 'no skills → llm_decide');
}

// ═══════════════════════════════════════════════
// TEST 11: Edge cases
// ═══════════════════════════════════════════════
async function testEdgeCases() {
  console.log('\n── Test 11: Edge cases ──');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autoEstate');
  const { conversationStateService } = await import('./services/conversationState.service.js');
  const { ConversationState } = await import('./models/ConversationState.js');

  // 11a: Complete a goal that doesn't exist → should not crash
  const id1 = new mongoose.Types.ObjectId().toString();
  try {
    const result = await conversationStateService.completeGoal(id1, 'nonexistent', {});
    assert(result.goals.length === 0, 'completing nonexistent goal → empty, no crash');
  } catch {
    assert(false, 'completing nonexistent goal should not throw');
  }

  // 11b: Update step progress for nonexistent conversation → should not crash
  try {
    await conversationStateService.updateStepProgress('fake-id', 'fake-skill', { foo: 'bar' });
    assert(true, 'updating nonexistent conversation → no crash');
  } catch (err: any) {
    console.log(`    Error: ${err.message}`);
    assert(false, 'updating nonexistent conversation should not throw');
  }

  // 11c: Activate same skill twice in sequence (without completing first)
  const id2 = new mongoose.Types.ObjectId().toString();
  const s1 = await conversationStateService.activateGoal(id2, 'car-wash-estimator', [
    { id: 'v', label: 'Vehicle', collects: 'vehicle_type' },
  ]);
  assert(s1.goals.length === 1, 'first activation → 1 goal');
  const s2 = await conversationStateService.activateGoal(id2, 'car-wash-estimator', [
    { id: 'v', label: 'Vehicle', collects: 'vehicle_type' },
  ]);
  assert(s2.goals.length === 1, 'same skill re-activation → still 1 goal (reactivated, not duplicated)');
  assert(s2.goals[0].status === 'active', 'reactivated goal is active');

  // 11d: Skill with no steps
  const id3 = new mongoose.Types.ObjectId().toString();
  const s3 = await conversationStateService.activateGoal(id3, 'simple-skill');
  assert(s3.goals[0].steps!.length === 0, 'no-steps skill → empty steps array');
  const s4 = await conversationStateService.completeGoal(id3, 'simple-skill', { result: 'done' });
  assert(s4.goals[0].status === 'completed', 'no-steps skill completes fine');
  assert(s4.goals[0].observations.result === 'done', 'observations saved');

  // 11e: Multiple observations in single update
  const id4 = new mongoose.Types.ObjectId().toString();
  await conversationStateService.activateGoal(id4, 'car-wash-estimator', [
    { id: 'v', label: 'Vehicle', collects: 'vehicle_type' },
    { id: 's', label: 'Service', collects: 'wash_package' },
    { id: 'e', label: 'Estimate', collects: 'estimated_price' },
  ]);
  await conversationStateService.updateStepProgress(id4, 'car-wash-estimator', {
    vehicle_type: 'sedan',
    wash_package: 'basic',
  });
  const s5 = (await conversationStateService.load(id4))!;
  assert(s5.goals[0].steps![0].status === 'completed', 'batch: step 1 completed');
  assert(s5.goals[0].steps![1].status === 'completed', 'batch: step 2 completed');
  assert(s5.goals[0].steps![2].status === 'active', 'batch: step 3 auto-activated');

  // 11f: Estimate price edge cases
  const scriptPath = path.resolve(process.cwd(), 'uploads/skills/697460d7fbd1f7612d4845ed/car-wash-estimator/scripts/estimate_price.py');
  if (fs.existsSync(scriptPath)) {
    // Invalid vehicle
    const e1 = execSync(`python3 "${scriptPath}" helicopter basic 2>&1 || true`, { encoding: 'utf-8' });
    const r1 = JSON.parse(e1);
    assert(!!r1.error, 'invalid vehicle → error');

    // Invalid service
    const e2 = execSync(`python3 "${scriptPath}" sedan waxing 2>&1 || true`, { encoding: 'utf-8' });
    const r2 = JSON.parse(e2);
    assert(!!r2.error, 'invalid service → error');

    // No arguments
    const e3 = execSync(`python3 "${scriptPath}" 2>&1 || true`, { encoding: 'utf-8' });
    assert(e3.includes('Usage') || e3.includes('error') || e3.includes('Error'), 'no args → usage/error message');
  }

  await ConversationState.deleteMany({ conversationId: { $in: [id1, id2, id3, id4] } });
  await mongoose.disconnect();
  console.log('  Cleaned up & disconnected');
}

// ═══════════════════════════════════════════════
// RUN ALL
// ═══════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  AutoEstate Agent — Full Scenario Tests  ║');
  console.log('╚══════════════════════════════════════════╝');

  testAllPrices();
  await testFrontmatter();
  await testRouter();
  testFabricationGuard();
  await testConversationStateLifecycle();
  await testEstimateToBookingHandoff();
  await testMidEstimateSwitchToBooking();
  await testSuspendedGoalResume();
  await testThreeDeepNesting();
  await testRouterThreeDeepNesting();
  await testEdgeCases();

  console.log(`\n══════════════════════════════════════`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`══════════════════════════════════════`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error('CRASH:', err); process.exit(1); });
