/**
 * SLA Engine Service
 * 
 * Manages deterministic SLA tracking for emails, messages, jobs, and tasks.
 * Features:
 * - Automatic SLA creation based on trigger events
 * - Business hours calculation
 * - Pause/resume functionality
 * - Deadline override (statutory deadlines compress SLAs)
 * - Breach detection
 */

import { supabase } from "@/integrations/supabase/client";

export interface SLADefinition {
  id: string;
  organization_id: string;
  sla_type: "client_email" | "in_app_message" | "internal_message" | "job" | "task";
  job_type?: string;
  service_code?: string;
  name: string;
  description?: string;
  trigger_event: string;
  trigger_status?: string;
  pause_conditions: string[];
  stop_conditions: string[];
  default_duration_hours: number;
  urgent_duration_hours?: number;
  is_active: boolean;
  is_system: boolean;
}

export interface SLAInstance {
  id: string;
  organization_id: string;
  sla_definition_id?: string;
  entity_type: "email" | "message" | "job" | "task" | "conversation";
  entity_id: string;
  started_at: string;
  paused_at?: string;
  paused_total_seconds: number;
  due_at: string;
  completed_at?: string;
  breached: boolean;
  breached_at?: string;
  status: "active" | "paused" | "completed" | "breached";
  compressed: boolean;
  metadata: Record<string, any>;
}

export interface BusinessHours {
  start: string; // "09:00"
  end: string; // "17:30"
  days: string[]; // ["monday", "tuesday", ...]
}

export interface OrgSLASettings {
  business_hours_start: string;
  business_hours_end: string;
  business_days: string[];
  sla_email_response_hours: number;
  sla_portal_message_hours: number;
  sla_internal_message_hours: number;
  sla_task_default_hours: number;
  sla_task_urgent_hours: number;
}

/**
 * Get organization SLA settings
 */
export async function getOrgSLASettings(organizationId: string): Promise<OrgSLASettings | null> {
  const { data, error } = await supabase
    .from("org_settings")
    .select(
      "business_hours_start, business_hours_end, business_days, sla_email_response_hours, sla_portal_message_hours, sla_internal_message_hours, sla_task_default_hours, sla_task_urgent_hours"
    )
    .eq("organization_id", organizationId)
    .single();

  if (error || !data) return null;
  return data as OrgSLASettings;
}

/**
 * Calculate the adjusted due date considering business hours
 */
export function calculateAdjustedDueDate(
  startTime: Date,
  durationHours: number,
  businessHours: BusinessHours
): Date {
  const { start, end, days } = businessHours;

  // Parse business hours
  const [startHour, startMin] = start.split(":").map(Number);
  const [endHour, endMin] = end.split(":").map(Number);

  const businessDayMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
  const totalMinutesNeeded = durationHours * 60;

  let currentDate = new Date(startTime);
  let remainingMinutes = totalMinutesNeeded;

  // Process day by day
  while (remainingMinutes > 0) {
    const dayName = currentDate.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();

    if (days.includes(dayName)) {
      const currentHour = currentDate.getHours();
      const currentMin = currentDate.getMinutes();
      const currentDayMinutes = currentHour * 60 + currentMin;

      // Calculate available minutes for today
      const dayStartMinutes = startHour * 60 + startMin;
      const dayEndMinutes = endHour * 60 + endMin;

      let availableToday = 0;
      if (currentDayMinutes < dayStartMinutes) {
        // Before business hours
        availableToday = businessDayMinutes;
        currentDate.setHours(startHour, startMin, 0, 0);
      } else if (currentDayMinutes < dayEndMinutes) {
        // During business hours
        availableToday = dayEndMinutes - currentDayMinutes;
      }
      // After business hours: availableToday stays 0

      if (availableToday >= remainingMinutes) {
        // Can complete today
        currentDate.setMinutes(currentDate.getMinutes() + remainingMinutes);
        remainingMinutes = 0;
      } else {
        remainingMinutes -= availableToday;
        // Move to next day start
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(startHour, startMin, 0, 0);
      }
    } else {
      // Not a business day, move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(startHour, startMin, 0, 0);
    }

    // Safety check to prevent infinite loops
    if (currentDate.getTime() - startTime.getTime() > 365 * 24 * 60 * 60 * 1000) {
      break;
    }
  }

  return currentDate;
}

/**
 * Start a new SLA instance
 */
export async function startSLA(params: {
  organizationId: string;
  entityType: SLAInstance["entity_type"];
  entityId: string;
  slaDefinitionId?: string;
  durationHours?: number;
  isUrgent?: boolean;
  metadata?: Record<string, any>;
}): Promise<SLAInstance | null> {
  const { organizationId, entityType, entityId, slaDefinitionId, durationHours, isUrgent, metadata } = params;

  // Get org settings for business hours
  const settings = await getOrgSLASettings(organizationId);
  
  let duration = durationHours || 24; // Default 24 hours

  // If we have a definition, use its duration
  if (slaDefinitionId) {
    const { data: definition } = await supabase
      .from("sla_definitions")
      .select("default_duration_hours, urgent_duration_hours")
      .eq("id", slaDefinitionId)
      .single();

    if (definition) {
      duration = isUrgent && definition.urgent_duration_hours
        ? definition.urgent_duration_hours
        : definition.default_duration_hours;
    }
  }

  const now = new Date();
  let dueAt: Date;

  if (settings) {
    dueAt = calculateAdjustedDueDate(now, duration, {
      start: settings.business_hours_start,
      end: settings.business_hours_end,
      days: settings.business_days,
    });
  } else {
    // No settings, use simple calculation
    dueAt = new Date(now.getTime() + duration * 60 * 60 * 1000);
  }

  const { data, error } = await supabase
    .from("sla_instances")
    .insert({
      organization_id: organizationId,
      sla_definition_id: slaDefinitionId || null,
      entity_type: entityType,
      entity_id: entityId,
      started_at: now.toISOString(),
      due_at: dueAt.toISOString(),
      status: "active",
      metadata: metadata || {},
    })
    .select()
    .single();

  if (error) {
    console.error("Error starting SLA:", error);
    return null;
  }

  return data as SLAInstance;
}

/**
 * Pause an SLA instance
 */
export async function pauseSLA(slaInstanceId: string): Promise<boolean> {
  const { error } = await supabase
    .from("sla_instances")
    .update({
      paused_at: new Date().toISOString(),
      status: "paused",
    })
    .eq("id", slaInstanceId)
    .eq("status", "active");

  return !error;
}

/**
 * Resume a paused SLA instance
 */
export async function resumeSLA(slaInstanceId: string): Promise<boolean> {
  // Get current instance
  const { data: instance, error: fetchError } = await supabase
    .from("sla_instances")
    .select("paused_at, paused_total_seconds, due_at")
    .eq("id", slaInstanceId)
    .single();

  if (fetchError || !instance || !instance.paused_at) return false;

  const pausedAt = new Date(instance.paused_at);
  const now = new Date();
  const pausedSeconds = Math.floor((now.getTime() - pausedAt.getTime()) / 1000);

  // Extend due_at by the paused duration
  const originalDue = new Date(instance.due_at);
  const newDue = new Date(originalDue.getTime() + pausedSeconds * 1000);

  const { error } = await supabase
    .from("sla_instances")
    .update({
      paused_at: null,
      paused_total_seconds: (instance.paused_total_seconds || 0) + pausedSeconds,
      due_at: newDue.toISOString(),
      status: "active",
    })
    .eq("id", slaInstanceId);

  return !error;
}

/**
 * Complete an SLA instance
 */
export async function completeSLA(slaInstanceId: string): Promise<boolean> {
  const now = new Date();

  // First check if it's already breached
  const { data: instance } = await supabase
    .from("sla_instances")
    .select("due_at")
    .eq("id", slaInstanceId)
    .single();

  const breached = instance ? new Date(instance.due_at) < now : false;

  const { error } = await supabase
    .from("sla_instances")
    .update({
      completed_at: now.toISOString(),
      status: breached ? "breached" : "completed",
      breached,
      breached_at: breached ? now.toISOString() : null,
    })
    .eq("id", slaInstanceId);

  return !error;
}

/**
 * Apply deadline override - compress SLA if statutory deadline is sooner
 */
export async function applyDeadlineOverride(
  slaInstanceId: string,
  statutoryDeadline: Date
): Promise<{ compressed: boolean; newDueAt: Date | null }> {
  const { data: instance, error } = await supabase
    .from("sla_instances")
    .select("due_at")
    .eq("id", slaInstanceId)
    .single();

  if (error || !instance) {
    return { compressed: false, newDueAt: null };
  }

  const currentDue = new Date(instance.due_at);

  if (statutoryDeadline < currentDue) {
    // Compress the SLA
    const { error: updateError } = await supabase
      .from("sla_instances")
      .update({
        due_at: statutoryDeadline.toISOString(),
        compressed: true,
      })
      .eq("id", slaInstanceId);

    if (!updateError) {
      return { compressed: true, newDueAt: statutoryDeadline };
    }
  }

  return { compressed: false, newDueAt: currentDue };
}

/**
 * Get all breached SLAs for an organization
 */
export async function getBreachedSLAs(organizationId: string): Promise<SLAInstance[]> {
  const { data, error } = await supabase
    .from("sla_instances")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("breached", true)
    .order("breached_at", { ascending: false });

  if (error) return [];
  return data as SLAInstance[];
}

/**
 * Get active SLAs at risk (within 25% of due time remaining)
 */
export async function getAtRiskSLAs(organizationId: string): Promise<SLAInstance[]> {
  const now = new Date();

  const { data, error } = await supabase
    .from("sla_instances")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .lt("due_at", new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()) // Due within 24 hours
    .order("due_at", { ascending: true });

  if (error) return [];
  return data as SLAInstance[];
}

/**
 * Get SLA stats for dashboard
 */
export async function getSLAStats(organizationId: string): Promise<{
  active: number;
  atRisk: number;
  breached: number;
  completedOnTime: number;
}> {
  const now = new Date();
  const riskThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [activeRes, atRiskRes, breachedRes, completedRes] = await Promise.all([
    supabase
      .from("sla_instances")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    supabase
      .from("sla_instances")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .lt("due_at", riskThreshold.toISOString()),
    supabase
      .from("sla_instances")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("breached", true),
    supabase
      .from("sla_instances")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "completed")
      .eq("breached", false),
  ]);

  return {
    active: activeRes.count || 0,
    atRisk: atRiskRes.count || 0,
    breached: breachedRes.count || 0,
    completedOnTime: completedRes.count || 0,
  };
}
