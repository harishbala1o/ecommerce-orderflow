{{- define "orderflow.name" -}}
{{- default "orderflow" .Values.nameOverride -}}
{{- end -}}

{{- define "orderflow.labels" -}}
app.kubernetes.io/part-of: orderflow
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "orderflow.secretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{- .Values.secrets.existingSecret -}}
{{- else -}}
{{- printf "%s-secrets" (include "orderflow.name" .) -}}
{{- end -}}
{{- end -}}

{{/* postgres connection URL assembled from secret+config (dev in-cluster postgres) */}}
{{- define "orderflow.databaseUrl" -}}
postgres://{{ .Values.postgres.user }}:$(POSTGRES_PASSWORD)@{{ include "orderflow.name" . }}-postgres:5432/{{ .Values.postgres.db }}
{{- end -}}
