package com.autarkos.system;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.autarkos.api.AutarkOsStates;
import com.autarkos.apps.ApplicationRelationship;
import com.autarkos.apps.ApplicationState;
import com.autarkos.apps.ApplicationStateService;
import com.autarkos.apps.ApplicationView;
import com.autarkos.apps.ApplicationEvidence;
import com.autarkos.marketplace.install.AppRuntimeView;
import com.autarkos.system.UpdateInventoryModels.AppOutcome;
import com.autarkos.system.UpdateInventoryModels.ManagedApp;
import com.autarkos.system.UpdateInventoryModels.Snapshot;
import com.autarkos.system.UpdateInventoryModels.Verification;
import com.autarkos.system.UpdateInventoryModels.Violation;

@Service
public class UpdateInventoryService {

    static final int SCHEMA_VERSION = 1;

    private final ApplicationStateService applicationStateService;
    private final InstanceIdentityService identityService;

    public UpdateInventoryService(ApplicationStateService applicationStateService, InstanceIdentityService identityService) {
        this.applicationStateService = applicationStateService;
        this.identityService = identityService;
    }

    public Snapshot capture() {
        ApplicationState state = freshApplicationState();
        Snapshot snapshot = snapshot(state, identityService.current());
        requireUsableSnapshot(snapshot);
        return snapshot;
    }

    public Verification verify(Snapshot before) {
        requireUsableSnapshot(before);
        ApplicationState currentState = freshApplicationState();
        AutarkOsIdentity currentIdentity = identityService.current();
        Snapshot after = snapshot(currentState, currentIdentity);
        Map<String, ApplicationView> currentById = new LinkedHashMap<>();
        for (ApplicationView application : currentState.applications()) {
            currentById.put(application.id(), application);
        }

        List<Violation> violations = new ArrayList<>();
        List<AppOutcome> outcomes = new ArrayList<>();
        verifyInstallationIdentity(before, currentIdentity, violations);
        for (ManagedApp previous : before.managedApps()) {
            verifyApp(previous, currentById.get(previous.catalogAppId()), currentIdentity, outcomes, violations);
        }

        boolean safe = violations.isEmpty();
        long managed = outcomes.stream().filter(outcome -> "managed".equals(outcome.status())).count();
        long recoveryRequired = outcomes.stream().filter(outcome -> "recovery_required".equals(outcome.status())).count();
        String summary = safe
                ? "Verified " + managed + " managed app(s) and " + recoveryRequired + " explicit recovery case(s) after the update."
                : "Update inventory verification found " + violations.size() + " ownership regression(s).";
        return new Verification(
                SCHEMA_VERSION,
                Instant.now(),
                safe,
                summary,
                before,
                after,
                List.copyOf(outcomes),
                List.copyOf(violations));
    }

    private ApplicationState freshApplicationState() {
        ApplicationState state = applicationStateService.refreshNowExclusively();
        if (state == null
                || state.stale()
                || !AutarkOsStates.SnapshotState.IDLE.equals(state.refreshStatus())
                || state.updatedAt() == null
                || state.refreshCompletedAt() == null
                || (state.lastError() != null && !state.lastError().isBlank())) {
            throw new IllegalStateException("A fresh managed-app inventory could not be collected.");
        }
        return state;
    }

    private Snapshot snapshot(ApplicationState state, AutarkOsIdentity identity) {
        List<ManagedApp> managedApps = state.applications().stream()
                .filter(ApplicationView::managed)
                .map(application -> managedApp(application, identity))
                .toList();
        return new Snapshot(
                SCHEMA_VERSION,
                Instant.now(),
                value(identity.instanceId()),
                value(identity.runtimeRoot()),
                value(identity.runtimeRootHash()),
                managedApps);
    }

    private ManagedApp managedApp(ApplicationView application, AutarkOsIdentity identity) {
        AppRuntimeView runtime = application.runtime();
        return new ManagedApp(
                value(application.id()),
                value(application.appInstanceId()),
                value(identity.instanceId()),
                runtime == null ? "" : value(runtime.runtimePath()),
                runtime == null ? "" : value(runtime.composeProject()),
                "owned",
                application.relationship().value());
    }

    private void verifyInstallationIdentity(Snapshot before, AutarkOsIdentity current, List<Violation> violations) {
        if (!before.ownerInstanceId().equals(value(current.instanceId()))) {
            violations.add(new Violation("", "owner_instance_changed",
                    "The Autark-OS owner instance changed during the update."));
        }
        if (!before.runtimeRoot().equals(value(current.runtimeRoot()))
                || !before.runtimeRootHash().equals(value(current.runtimeRootHash()))) {
            violations.add(new Violation("", "runtime_root_changed",
                    "The managed runtime root changed during the update."));
        }
    }

    private void verifyApp(
            ManagedApp previous,
            ApplicationView current,
            AutarkOsIdentity currentIdentity,
            List<AppOutcome> outcomes,
            List<Violation> violations) {
        if (current == null) {
            fail(previous, "missing", "application_disappeared",
                    "The app disappeared from the canonical application inventory.", outcomes, violations);
            return;
        }
        if (current.relationship() == ApplicationRelationship.RECOVERY_REQUIRED) {
            if (!recoveryEvidenceMatches(previous, current.evidence())) {
                fail(previous, current.relationship().value(), "recovery_identity_mismatch",
                        "The recovery evidence no longer matches the app that was managed before the update.", outcomes, violations);
                return;
            }
            outcomes.add(new AppOutcome(previous.catalogAppId(), previous.relationship(), current.relationship().value(),
                    "recovery_required", "The app remains identifiable and is explicitly marked for recovery."));
            return;
        }
        if (current.relationship() != ApplicationRelationship.MANAGED) {
            String code = current.relationship() == ApplicationRelationship.AVAILABLE
                    ? "became_available"
                    : "became_blocked";
            fail(previous, current.relationship().value(), code,
                    "A previously managed app is no longer managed or explicitly recoverable.", outcomes, violations);
            return;
        }

        ManagedApp currentManaged = managedApp(current, currentIdentity);
        if (!sameManagedIdentity(previous, currentManaged)) {
            fail(previous, current.relationship().value(), "managed_identity_changed",
                    "The app is still labeled managed, but its durable managed identity changed.", outcomes, violations);
            return;
        }
        outcomes.add(new AppOutcome(previous.catalogAppId(), previous.relationship(), current.relationship().value(),
                "managed", "The app retained its complete managed identity."));
    }

    private boolean sameManagedIdentity(ManagedApp before, ManagedApp after) {
        return requiredEqual(before.catalogAppId(), after.catalogAppId())
                && requiredEqual(before.appInstanceId(), after.appInstanceId())
                && requiredEqual(before.ownerInstanceId(), after.ownerInstanceId())
                && requiredEqual(before.runtimePath(), after.runtimePath())
                && requiredEqual(before.composeProject(), after.composeProject())
                && requiredEqual(before.ownershipState(), after.ownershipState());
    }

    private boolean recoveryEvidenceMatches(ManagedApp before, ApplicationEvidence evidence) {
        if (evidence == null) {
            return false;
        }
        boolean stableIdentityPresent = !value(evidence.appInstanceId()).isBlank()
                || !value(evidence.ownerInstanceId()).isBlank()
                || !value(evidence.composeProject()).isBlank();
        return stableIdentityPresent
                && optionalEqual(before.appInstanceId(), evidence.appInstanceId())
                && optionalEqual(before.ownerInstanceId(), evidence.ownerInstanceId())
                && optionalEqual(before.composeProject(), evidence.composeProject());
    }

    private boolean requiredEqual(String before, String after) {
        return !value(before).isBlank() && value(before).equals(value(after));
    }

    private boolean optionalEqual(String before, String observed) {
        return value(observed).isBlank() || requiredEqual(before, observed);
    }

    private void fail(
            ManagedApp previous,
            String currentRelationship,
            String code,
            String message,
            List<AppOutcome> outcomes,
            List<Violation> violations) {
        outcomes.add(new AppOutcome(previous.catalogAppId(), previous.relationship(), currentRelationship, "regressed", message));
        violations.add(new Violation(previous.catalogAppId(), code, message));
    }

    private void requireUsableSnapshot(Snapshot snapshot) {
        if (snapshot == null || snapshot.schemaVersion() != SCHEMA_VERSION || snapshot.managedApps() == null
                || value(snapshot.ownerInstanceId()).isBlank()
                || value(snapshot.runtimeRoot()).isBlank()
                || value(snapshot.runtimeRootHash()).isBlank()) {
            throw new IllegalArgumentException("The pre-update managed-app inventory is missing or unsupported.");
        }
        java.util.Set<String> appIds = new java.util.HashSet<>();
        for (ManagedApp app : snapshot.managedApps()) {
            if (app == null
                    || value(app.catalogAppId()).isBlank()
                    || value(app.appInstanceId()).isBlank()
                    || value(app.ownerInstanceId()).isBlank()
                    || value(app.runtimePath()).isBlank()
                    || value(app.composeProject()).isBlank()
                    || value(app.ownershipState()).isBlank()
                    || !"managed".equals(app.relationship())
                    || !appIds.add(app.catalogAppId())) {
                throw new IllegalArgumentException("The pre-update managed-app inventory contains an invalid app identity.");
            }
        }
    }

    private String value(String value) {
        return value == null ? "" : value;
    }
}
