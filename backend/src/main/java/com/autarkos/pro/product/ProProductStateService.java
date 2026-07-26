package com.autarkos.pro.product;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.pro.entitlement.ProEntitlementService;
import com.autarkos.pro.entitlement.ProStatusResponse;
import com.autarkos.pro.model.ProEntitlementState;
import com.autarkos.pro.model.ProEntitlementStatus;
import com.autarkos.pro.model.ProModuleState;

@Service
public class ProProductStateService {

    private static final String NOT_IMPLEMENTED = "not_implemented";

    private final ProEntitlementService entitlements;
    private final Clock clock;

    @Autowired
    public ProProductStateService(ProEntitlementService entitlements) {
        this(entitlements, Clock.systemUTC());
    }

    ProProductStateService(ProEntitlementService entitlements, Clock clock) {
        this.entitlements = entitlements;
        this.clock = clock;
    }

    public ProProductState current() {
        return derive(entitlements.status(), clock.instant());
    }

    ProProductState derive(ProStatusResponse source, Instant checkedAt) {
        ProEntitlementStatus entitlement = source.entitlement();
        ProStatusResponse.ModuleStatus module = source.module();
        ProProductState.SoftwareEntitlement software = software(entitlement);
        ProProductState.HostedServices hosted = hosted(entitlement, checkedAt);
        ProProductState.Agent agent = agent(module);
        List<String> features = entitlement.features() == null
                ? List.of()
                : entitlement.features().stream()
                        .filter(Objects::nonNull)
                        .filter(value -> value.matches(
                                "^[a-z][a-z0-9.-]{1,127}$"))
                        .distinct()
                        .sorted()
                        .limit(64)
                        .toList();
        List<String> localCapabilities = entitlement.localUseAllowed()
                ? features
                : List.of();
        List<String> hostedCapabilities = entitlement.hostedServicesAllowed()
                ? features
                : List.of();
        ProProductState.RecommendedAction action =
                recommendedAction(source, software, hosted, agent);

        return new ProProductState(
                "1",
                overallStatus(software, agent),
                software,
                hosted,
                agent,
                new ProProductState.Guardian(
                        "unavailable",
                        "unavailable",
                        "unavailable",
                        null,
                        null,
                        NOT_IMPLEMENTED),
                new ProProductState.Mobile(
                        "unavailable", 0, NOT_IMPLEMENTED),
                new ProProductState.HostedMobile(
                        "unavailable",
                        0,
                        "unavailable",
                        null,
                        NOT_IMPLEMENTED),
                localCapabilities,
                hostedCapabilities,
                action,
                checkedAt);
    }

    private static ProProductState.SoftwareEntitlement software(
            ProEntitlementStatus entitlement) {
        return new ProProductState.SoftwareEntitlement(
                switch (entitlement.state()) {
                    case NOT_ACTIVATED -> "absent";
                    case ACTIVATING -> "activating";
                    case ACTIVE -> "active";
                    case ONLINE_GRACE -> "grace";
                    case RETAINED_USE -> "retained_use";
                    case SUSPENDED_ONLINE -> "suspended";
                    case REVOKED -> "revoked";
                    case INVALID -> "invalid";
                    case ERROR -> "error";
                },
                entitlement.localUseAllowed(),
                entitlement.updatesAllowed(),
                entitlement.updatesThrough(),
                safeReason(entitlement.reasonCode(), "unknown"));
    }

    private static ProProductState.HostedServices hosted(
            ProEntitlementStatus entitlement,
            Instant checkedAt) {
        String state;
        if (entitlement.hostedServicesAllowed()) {
            state = entitlement.state() == ProEntitlementState.ONLINE_GRACE
                    ? "grace"
                    : "active";
        } else if (entitlement.state() == ProEntitlementState.REVOKED) {
            state = "revoked";
        } else if (entitlement.state() == ProEntitlementState.ERROR) {
            state = "error";
        } else if (entitlement.serviceLeaseExpiresAt() != null
                && !entitlement.serviceLeaseExpiresAt().isAfter(checkedAt)) {
            state = "expired";
        } else if (entitlement.state()
                == ProEntitlementState.SUSPENDED_ONLINE) {
            state = "suspended";
        } else {
            state = "unavailable";
        }
        return new ProProductState.HostedServices(
                state,
                entitlement.hostedServicesAllowed(),
                entitlement.serviceLeaseExpiresAt(),
                entitlement.lastVerifiedServerTime(),
                state.equals("active") ? "active"
                        : safeReason(entitlement.reasonCode(), state));
    }

    private static ProProductState.Agent agent(
            ProStatusResponse.ModuleStatus module) {
        String state = switch (module.state()) {
            case NOT_INSTALLED -> "not_installed";
            case RELEASE_AVAILABLE -> "release_available";
            case DOWNLOADING, VERIFYING, STARTING_CANDIDATE,
                    HEALTH_CHECKING, ROLLING_BACK -> "installing";
            case ACTIVE -> "active";
            case DEGRADED -> "degraded";
            case RETAINED_USE -> "retained_use";
            case UPDATE_INELIGIBLE -> "update_ineligible";
            case REMOVING -> "removing";
            case ERROR -> "error";
        };
        String health = switch (safeToken(module.health())) {
            case "healthy" -> "healthy";
            case "degraded" -> "degraded";
            case "failed" -> "failed";
            default -> "not_checked";
        };
        String compatibility = module.state() == ProModuleState.UPDATE_INELIGIBLE
                ? "incompatible"
                : module.activeDigest() == null ? "unknown" : "compatible";
        return new ProProductState.Agent(
                state,
                health,
                compatibility,
                bounded(module.componentVersion(), 64),
                digestPrefix(module.activeDigest()),
                module.lastTransitionAt(),
                module.errorCode() == null
                        ? defaultAgentReason(state, health, module.state())
                        : "lifecycle_error");
    }

    private static String overallStatus(
            ProProductState.SoftwareEntitlement software,
            ProProductState.Agent agent) {
        if ("error".equals(software.state()) || "error".equals(agent.state())) {
            return "error";
        }
        if ("incompatible".equals(agent.compatibility())) {
            return "incompatible";
        }
        if ("retained_use".equals(software.state())
                || "retained_use".equals(agent.state())) {
            return "retained_use";
        }
        if ("grace".equals(software.state())) {
            return "stale";
        }
        if (!software.localUseAllowed()) {
            return "unavailable";
        }
        if ("active".equals(agent.state())
                && "healthy".equals(agent.health())) {
            return "partial";
        }
        return "partial";
    }

    private static ProProductState.RecommendedAction recommendedAction(
            ProStatusResponse source,
            ProProductState.SoftwareEntitlement software,
            ProProductState.HostedServices hosted,
            ProProductState.Agent agent) {
        if (source.activation() != null
                && source.activation().activationId() != null) {
            return action("continue_activation", "activation_pending");
        }
        if ("absent".equals(software.state())) {
            return action("activate", "not_activated");
        }
        if ("activating".equals(software.state())) {
            return action("continue_activation", "activation_pending");
        }
        if (!software.localUseAllowed()) {
            return action("review_entitlement", software.reasonCode());
        }
        if ("release_available".equals(agent.state())) {
            return action("install_release", "signed_release_available");
        }
        if ("not_installed".equals(agent.state())) {
            return action("check_release", "agent_not_installed");
        }
        if ("error".equals(agent.state())
                || "degraded".equals(agent.state())
                || "failed".equals(agent.health())) {
            return action("check_release", "agent_needs_attention");
        }
        if ("incompatible".equals(agent.compatibility())) {
            return action("review_compatibility", "agent_incompatible");
        }
        if ("expired".equals(hosted.state())) {
            return action("renew_hosted_services", "hosted_services_expired");
        }
        if (software.updatesAllowed() && "active".equals(agent.state())) {
            return action("check_release", "release_check_available");
        }
        return action("none", "no_action_required");
    }

    private static ProProductState.RecommendedAction action(
            String id, String reason) {
        return new ProProductState.RecommendedAction(id, reason);
    }

    private static String digestPrefix(String digest) {
        if (digest == null || !digest.matches("^sha256:[a-f0-9]{64}$")) {
            return null;
        }
        return digest.substring(0, "sha256:".length() + 12);
    }

    private static String defaultAgentReason(
            String state,
            String health,
            ProModuleState moduleState) {
        if ("active".equals(state) && "healthy".equals(health)) {
            return "healthy";
        }
        return moduleState.name().toLowerCase(Locale.ROOT);
    }

    private static String safeReason(String value, String fallback) {
        return value != null && value.matches("^[a-z][a-z0-9_]{0,63}$")
                ? value
                : fallback;
    }

    private static String safeToken(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }

    private static String bounded(String value, int maximumLength) {
        return value == null || value.length() > maximumLength
                ? null
                : value;
    }
}
