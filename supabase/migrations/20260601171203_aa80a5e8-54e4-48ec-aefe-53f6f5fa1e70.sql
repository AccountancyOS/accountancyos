
INSERT INTO public.engagement_letter_template_variants
  (organization_id, engagement_kind, is_default, is_active, subject, body)
SELECT o.id, kind.k, true, true,
  CASE kind.k
    WHEN 'one_off' THEN 'Engagement Letter - {{firm_name}}'
    WHEN 'annual_renewal' THEN 'Annual Engagement Renewal - {{firm_name}}'
    ELSE 'Please sign your engagement letter - {{firm_name}}'
  END,
  '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;">'
  || '<h2 style="color:#1a1a1a;margin-bottom:20px;">Engagement Letter</h2>'
  || '<p style="color:#4a4a4a;line-height:1.6;">Dear {{recipient_name}},</p>'
  || '<p style="color:#4a4a4a;line-height:1.6;">Thank you for choosing {{firm_name}}. Please review and sign your engagement letter before we begin work together.</p>'
  || '<p style="color:#4a4a4a;line-height:1.6;">This document outlines the services we will provide, our responsibilities, and the terms of our engagement.</p>'
  || '<div style="margin:30px 0;text-align:center;"><a href="{{signing_url}}" style="display:inline-block;background-color:#2563eb;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:500;font-size:16px;">View and Sign Engagement Letter</a></div>'
  || '<p style="color:#6b7280;font-size:14px;line-height:1.6;">This link will expire in 14 days. If you have any questions, please contact us.</p>'
  || '<hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0;" />'
  || '<p style="color:#9ca3af;font-size:12px;">Sent from {{firm_name}} via AccountancyOS</p>'
  || '</div>'
FROM public.organizations o
CROSS JOIN (VALUES ('one_off'), ('recurring'), ('annual_renewal')) AS kind(k)
WHERE NOT EXISTS (
  SELECT 1 FROM public.engagement_letter_template_variants v
  WHERE v.organization_id = o.id
    AND v.engagement_kind = kind.k
    AND v.is_active
    AND COALESCE(v.client_type,'') = ''
    AND COALESCE(v.service_code,'') = ''
    AND COALESCE(v.legal_entity,'') = ''
);
