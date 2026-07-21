package com.autarkos.pro.audit;

import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.autarkos.activity.ActivityLogRepository;
import com.autarkos.pro.model.ProEntitlementState;
import com.autarkos.pro.model.ProModuleState;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

@Service
public class ProAuditService {

    private static final Pattern IDEMPOTENCY_KEY =
            Pattern.compile("^[A-Za-z0-9._:-]{1,160}$");
    private static final Pattern CORRELATION_ID =
            Pattern.compile("^[A-Za-z0-9._:-]{1,128}$");
    private static final Pattern REASON_CODE =
            Pattern.compile("^[a-z][a-z0-9_]{0,63}$");
    private static final Pattern KEY_ID =
            Pattern.compile("^[A-Za-z0-9._-]{1,128}$");
    private static final Pattern SEMVER =
            Pattern.compile(
                    "^[0-9]+\\.[0-9]+\\.[0-9]+"
                            + "(?:-[0-9A-Za-z.-]+)?"
                            + "(?:\\+[0-9A-Za-z.-]+)?$");
    private static final Pattern SHA256 =
            Pattern.compile("^sha256:[0-9a-f]{64}$");
    private static final Pattern JWT =
            Pattern.compile(
                    "^[A-Za-z0-9_-]{3,}\\."
                            + "[A-Za-z0-9_-]{3,}\\."
                            + "[A-Za-z0-9_-]{3,}$");
    private static final Pattern SECRET_WORD =
            Pattern.compile(
                    "(?i).*(authorization|bearer|password|secret|"
                            + "activation.?code).*");
    private static final Set<String> COMPONENTS = Set.of(
            "autark-pro-agent",
            "device",
            "entitlement",
            "registry",
            "release");
    private static final Set<String> OUTCOMES = Set.of(
            "started",
            "completed",
            "failed",
            "needs_attention",
            "recorded");
    private static final Set<String> STATES = states();

    private final ActivityLogRepository repository;
    private final Clock clock;
    private final ObjectMapper objectMapper;

    @Autowired
    public ProAuditService(ActivityLogRepository repository) {
        this(repository, Clock.systemUTC());
    }

    ProAuditService(
            ActivityLogRepository repository,
            Clock clock) {
        this.repository = Objects.requireNonNull(repository);
        this.clock = Objects.requireNonNull(clock);
        this.objectMapper = new ObjectMapper()
                .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordRequired(ProAuditEvent event) {
        ValidatedEvent safe = validate(event);
        String eventKey = "pro:"
                + safe.type().wireValue()
                + ":"
                + safe.idempotencyKey();
        try {
            int inserted = repository.insertProAudit(
                    level(safe.outcome()),
                    safe.type().wireValue(),
                    title(safe.type(), safe.outcome()),
                    message(safe.type(), safe.outcome()),
                    activityOutcome(safe.outcome()),
                    details(safe),
                    clock.instant().toString(),
                    eventKey);
            if (inserted == 1) {
                return;
            }
            if (inserted == 0
                    && repository.findByEventKey(eventKey)
                            .isPresent()) {
                return;
            }
            throw new ProAuditException(
                    new IllegalStateException(
                            "Audit insert did not persist a row."));
        } catch (RuntimeException exception) {
            if (exception instanceof ProAuditException auditFailure) {
                throw auditFailure;
            }
            throw new ProAuditException(exception);
        }
    }

    private ValidatedEvent validate(ProAuditEvent event) {
        if (event == null
                || event.type() == null
                || !matches(
                        IDEMPOTENCY_KEY,
                        event.idempotencyKey())
                || !optional(
                        CORRELATION_ID,
                        event.correlationId())
                || !COMPONENTS.contains(event.component())
                || !optional(SEMVER, event.componentVersion())
                || !optional(SHA256, event.digest())
                || !optionalSet(STATES, event.fromState())
                || !optionalSet(STATES, event.toState())
                || !OUTCOMES.contains(event.outcome())
                || !optional(REASON_CODE, event.reasonCode())
                || !optional(KEY_ID, event.keyId())
                || !optional(SHA256, event.fingerprint())
                || looksSensitive(event.idempotencyKey())
                || looksSensitive(event.correlationId())
                || looksSensitive(event.keyId())) {
            throw new IllegalArgumentException(
                    "Invalid Autark Pro audit event.");
        }
        return new ValidatedEvent(
                event.idempotencyKey(),
                event.type(),
                event.correlationId() == null
                        ? fallbackCorrelation(
                                event.idempotencyKey())
                        : event.correlationId(),
                event.component(),
                event.componentVersion(),
                prefix(event.digest()),
                event.fromState(),
                event.toState(),
                event.outcome(),
                event.reasonCode() == null
                        ? defaultReason(event.outcome())
                        : event.reasonCode(),
                event.keyId(),
                prefix(event.fingerprint()));
    }

    private String details(ValidatedEvent event) {
        Map<String, String> context = new LinkedHashMap<>();
        put(context, "schemaVersion", "1");
        put(context, "eventType", event.type().wireValue());
        put(context, "correlationId", event.correlationId());
        put(context, "component", event.component());
        put(context, "componentVersion", event.componentVersion());
        put(context, "digestPrefix", event.digestPrefix());
        put(context, "fromState", event.fromState());
        put(context, "toState", event.toState());
        put(context, "outcome", event.outcome());
        put(context, "reasonCode", event.reasonCode());
        put(context, "keyId", event.keyId());
        put(context, "fingerprintPrefix", event.fingerprintPrefix());
        try {
            return objectMapper.writeValueAsString(context);
        } catch (JsonProcessingException exception) {
            throw new ProAuditException(exception);
        }
    }

    private static String level(String outcome) {
        return switch (outcome) {
            case "failed" -> "error";
            case "needs_attention" -> "warning";
            case "completed" -> "success";
            default -> "info";
        };
    }

    private static String activityOutcome(String outcome) {
        return switch (outcome) {
            case "started", "recorded" -> "completed";
            default -> outcome;
        };
    }

    private static String title(
            ProAuditEventType type,
            String outcome) {
        String subject = switch (type) {
            case ACTIVATION_STARTED -> "Pro activation";
            case DEVICE_REGISTRATION -> "Pro device registration";
            case ENTITLEMENT_REFRESH -> "Pro entitlement refresh";
            case ENTITLEMENT_STATE_TRANSITION ->
                    "Pro entitlement state";
            case MANIFEST_ACCEPTED, MANIFEST_REJECTED ->
                    "Pro release manifest";
            case REGISTRY_TOKEN_REQUESTED,
                    REGISTRY_TOKEN_ISSUED,
                    REGISTRY_TOKEN_FAILED ->
                    "Pro registry credential";
            case SIGNATURE_VERIFIED, SIGNATURE_REJECTED ->
                    "Pro release signature";
            case PULL_STARTED, PULL_COMPLETED, PULL_FAILED ->
                    "Pro agent download";
            case CANDIDATE_START -> "Pro candidate";
            case HEALTH_RESULT -> "Pro candidate health";
            case CUTOVER -> "Pro agent cutover";
            case ROLLBACK -> "Pro agent rollback";
            case REMOVAL -> "Pro module removal";
            case RETAINED_USE -> "Pro retained use";
            case MODULE_STATE_TRANSITION ->
                    "Pro module state";
        };
        return subject + " " + outcome.replace('_', ' ');
    }

    private static String message(
            ProAuditEventType type,
            String outcome) {
        return "Autark-OS recorded a "
                + type.wireValue().replace('_', ' ')
                + " event with outcome "
                + outcome.replace('_', ' ')
                + ".";
    }

    private static String prefix(String value) {
        return value == null
                ? null
                : "sha256:"
                        + value.substring("sha256:".length(), 19);
    }

    private static String fallbackCorrelation(
            String idempotencyKey) {
        String value = "audit-" + idempotencyKey;
        return value.length() <= 128
                ? value
                : value.substring(0, 128);
    }

    private static String defaultReason(String outcome) {
        return switch (outcome) {
            case "started" -> "requested";
            case "completed" -> "completed";
            case "failed" -> "failed";
            case "needs_attention" -> "needs_attention";
            default -> "observed";
        };
    }

    private static void put(
            Map<String, String> target,
            String key,
            String value) {
        if (value != null) {
            target.put(key, value);
        }
    }

    private static boolean matches(
            Pattern pattern,
            String value) {
        return value != null && pattern.matcher(value).matches();
    }

    private static boolean optional(
            Pattern pattern,
            String value) {
        return value == null || pattern.matcher(value).matches();
    }

    private static boolean optionalSet(
            Set<String> values,
            String value) {
        return value == null || values.contains(value);
    }

    private static boolean looksSensitive(String value) {
        return value != null
                && (JWT.matcher(value).matches()
                        || SECRET_WORD.matcher(value).matches());
    }

    private static Set<String> states() {
        var result = new java.util.HashSet<String>();
        result.addAll(List.of(ProModuleState.values()).stream()
                .map(Enum::name)
                .toList());
        result.addAll(List.of(ProEntitlementState.values()).stream()
                .map(Enum::name)
                .toList());
        return Set.copyOf(result);
    }

    private record ValidatedEvent(
            String idempotencyKey,
            ProAuditEventType type,
            String correlationId,
            String component,
            String componentVersion,
            String digestPrefix,
            String fromState,
            String toState,
            String outcome,
            String reasonCode,
            String keyId,
            String fingerprintPrefix) {
    }
}
