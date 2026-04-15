/**
 * GET  /api/revenue/post-call-notes?lead_id=xxx
 * POST /api/revenue/post-call-notes
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin    = createAdminClient()
  const leadId   = req.nextUrl.searchParams.get('lead_id')

  let query = admin
    .from('post_call_notes')
    .select('*')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })

  if (leadId) query = query.eq('lead_id', leadId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const body  = await req.json()

  const {
    lead_id, sale_id, closer_id, setter_id,
    call_date, appointment_source, call_outcome,
    offer_pitched, initial_payment_platform,
    cash_collected_upfront, amount_owed,
    expected_payoff_date, instalment_count,
    prospect_notes, crm_updated, program_status,
  } = body

  // Insert the post-call note
  const { data: note, error: noteErr } = await admin
    .from('post_call_notes')
    .insert({
      creator_id: creatorId,
      lead_id:    lead_id    || null,
      sale_id:    sale_id    || null,
      closer_id:  closer_id  || null,
      setter_id:  setter_id  || null,
      call_date:  call_date  || null,
      appointment_source:        appointment_source       || null,
      call_outcome:              call_outcome             || null,
      offer_pitched:             offer_pitched            || null,
      initial_payment_platform:  initial_payment_platform || null,
      cash_collected_upfront:    cash_collected_upfront   ?? null,
      amount_owed:               amount_owed              ?? null,
      expected_payoff_date:      expected_payoff_date     || null,
      instalment_count:          instalment_count         ?? null,
      prospect_notes:            prospect_notes           || null,
      crm_updated:               crm_updated              ?? null,
      program_status:            program_status           || null,
    })
    .select()
    .single()

  if (noteErr) return NextResponse.json({ error: noteErr.message }, { status: 500 })

  // If outcome is 'closed', create a sale record
  let saleData = null
  if (call_outcome === 'closed' && !sale_id) {
    const { data: sale, error: saleErr } = await admin
      .from('sales')
      .insert({
        creator_id:             creatorId,
        lead_id:                lead_id || null,
        closer_id:              closer_id || null,
        amount:                 cash_collected_upfront ?? 0,
        payment_type:           instalment_count > 1 ? 'instalment' : 'upfront',
        platform:               initial_payment_platform ?? 'manual',
        sale_date:              call_date || new Date().toISOString().slice(0, 10),
        total_contract_value:   (cash_collected_upfront ?? 0) + (amount_owed ?? 0),
        cash_collected_upfront: cash_collected_upfront ?? null,
        amount_owed:            amount_owed            ?? null,
        instalment_count:       instalment_count       ?? null,
        expected_payoff_date:   expected_payoff_date   || null,
        program_status:         program_status         || 'active',
        notes:                  offer_pitched          || null,
      })
      .select()
      .single()

    if (!saleErr && sale) {
      saleData = sale
      // Link note back to the new sale
      await admin
        .from('post_call_notes')
        .update({ sale_id: sale.id })
        .eq('id', note.id)

      // Auto-generate instalment schedule if multiple instalments
      if (instalment_count > 1 && amount_owed > 0) {
        const instalmentAmt = Math.round((amount_owed / (instalment_count - 1)) * 100) / 100
        const today = new Date()
        const rows = []
        // First instalment = upfront (already collected)
        rows.push({
          sale_id:           sale.id,
          creator_id:        creatorId,
          instalment_number: 1,
          amount:            cash_collected_upfront ?? 0,
          due_date:          call_date || today.toISOString().slice(0, 10),
          paid_date:         call_date || today.toISOString().slice(0, 10),
          status:            'paid',
        })
        // Remaining instalments
        for (let i = 2; i <= instalment_count; i++) {
          const dueDate = new Date(today)
          dueDate.setMonth(dueDate.getMonth() + (i - 1))
          rows.push({
            sale_id:           sale.id,
            creator_id:        creatorId,
            instalment_number: i,
            amount:            instalmentAmt,
            due_date:          dueDate.toISOString().slice(0, 10),
            status:            'pending',
          })
        }
        await admin.from('payment_instalments').insert(rows)
      }
    }
  }

  return NextResponse.json({ note, sale: saleData }, { status: 201 })
}
