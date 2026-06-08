import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePortalEntity } from "../contexts/PortalEntityContext";
import { listPortalTasks } from "../services/portalTasksService";
import { listPortalDocuments } from "../services/portalDocumentsService";
import { listPortalQuestionnaires } from "../services/portalQuestionnairesService";
import {
  listPortalConversations,
  listPortalMessages,
  sendPortalMessage,
} from "../services/portalMessagesService";
import { listPortalPayments } from "../services/portalPaymentsService";
import { getPortalVisibilitySettings } from "../services/portalVisibilityService";
import { getPortalFinancialSummary } from "../services/portalFinancialService";
import {
  listPortalUpcomingDeadlines,
  listPortalTaxPayments,
} from "../services/portalDeadlinesService";

function entityKey(e: ReturnType<typeof usePortalEntity>["currentEntity"]) {
  return e ? `${e.type}:${e.id}` : "none";
}

export function usePortalTasks() {
  const { currentEntity } = usePortalEntity();
  return useQuery({
    queryKey: ["portal", "tasks", entityKey(currentEntity)],
    queryFn: () => listPortalTasks(currentEntity),
    enabled: !!currentEntity,
  });
}

export function usePortalDocuments() {
  const { currentEntity } = usePortalEntity();
  return useQuery({
    queryKey: ["portal", "documents", entityKey(currentEntity)],
    queryFn: () => listPortalDocuments(currentEntity),
    enabled: !!currentEntity,
  });
}

export function usePortalQuestionnaires() {
  const { currentEntity } = usePortalEntity();
  return useQuery({
    queryKey: ["portal", "questionnaires", entityKey(currentEntity)],
    queryFn: () => listPortalQuestionnaires(currentEntity),
    enabled: !!currentEntity,
  });
}

export function usePortalConversations() {
  const { currentEntity } = usePortalEntity();
  return useQuery({
    queryKey: ["portal", "conversations", entityKey(currentEntity)],
    queryFn: () => listPortalConversations(currentEntity),
    enabled: !!currentEntity,
  });
}

export function usePortalMessages(rootMessageId: string | null) {
  return useQuery({
    queryKey: ["portal", "messages", rootMessageId],
    queryFn: () => listPortalMessages(rootMessageId!),
    enabled: !!rootMessageId,
  });
}

export function useSendPortalMessage() {
  const qc = useQueryClient();
  const { currentEntity } = usePortalEntity();
  return useMutation({
    mutationFn: async (args: { body: string; subject?: string | null; parentMessageId?: string | null }) => {
      if (!currentEntity) throw new Error("No entity selected");
      return sendPortalMessage({ entity: currentEntity, ...args });
    },
    onSuccess: (_id, vars) => {
      qc.invalidateQueries({ queryKey: ["portal", "conversations", entityKey(currentEntity)] });
      if (vars.parentMessageId) {
        qc.invalidateQueries({ queryKey: ["portal", "messages", vars.parentMessageId] });
      }
    },
  });
}

export function usePortalPayments() {
  const { currentEntity } = usePortalEntity();
  return useQuery({
    queryKey: ["portal", "payments", entityKey(currentEntity)],
    queryFn: () => listPortalPayments(currentEntity),
    enabled: !!currentEntity,
  });
}

export function usePortalVisibility() {
  const { currentEntity } = usePortalEntity();
  return useQuery({
    queryKey: ["portal", "visibility", entityKey(currentEntity)],
    queryFn: () => getPortalVisibilitySettings(currentEntity),
    enabled: !!currentEntity,
  });
}

export function usePortalFinancialSummary() {
  const { currentEntity } = usePortalEntity();
  const visibility = usePortalVisibility();
  return useQuery({
    queryKey: ["portal", "financial", entityKey(currentEntity)],
    queryFn: () => getPortalFinancialSummary(currentEntity, visibility.data!),
    enabled: !!currentEntity && !!visibility.data,
  });
}

export function usePortalUpcomingDeadlines() {
  const { currentEntity } = usePortalEntity();
  return useQuery({
    queryKey: ["portal", "deadlines-upcoming", entityKey(currentEntity)],
    queryFn: () => listPortalUpcomingDeadlines(currentEntity),
    enabled: !!currentEntity,
  });
}

export function usePortalTaxPayments() {
  const { currentEntity } = usePortalEntity();
  return useQuery({
    queryKey: ["portal", "tax-payments", entityKey(currentEntity)],
    queryFn: () => listPortalTaxPayments(currentEntity),
    enabled: !!currentEntity,
  });
}