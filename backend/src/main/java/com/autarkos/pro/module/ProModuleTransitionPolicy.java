package com.autarkos.pro.module;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.autarkos.pro.model.ProModuleState;

@Component
public final class ProModuleTransitionPolicy {

    private static final Map<ProModuleState, EnumSet<ProModuleState>> ALLOWED =
            transitions();

    public void requireAllowed(
            ProModuleState current,
            ProModuleState next) {
        if (current == null
                || next == null
                || (current != next
                        && !ALLOWED.getOrDefault(
                                        current,
                                        EnumSet.noneOf(ProModuleState.class))
                                .contains(next))) {
            throw new ProModuleException(
                    "invalid_module_transition",
                    "Autark Pro cannot perform that module transition.");
        }
    }

    public boolean allowed(ProModuleState current, ProModuleState next) {
        try {
            requireAllowed(current, next);
            return true;
        } catch (ProModuleException exception) {
            return false;
        }
    }

    private static Map<ProModuleState, EnumSet<ProModuleState>> transitions() {
        EnumMap<ProModuleState, EnumSet<ProModuleState>> values =
                new EnumMap<>(ProModuleState.class);
        allow(values, ProModuleState.NOT_INSTALLED,
                ProModuleState.RELEASE_AVAILABLE,
                ProModuleState.UPDATE_INELIGIBLE,
                ProModuleState.ERROR);
        allow(values, ProModuleState.RELEASE_AVAILABLE,
                ProModuleState.DOWNLOADING,
                ProModuleState.ACTIVE,
                ProModuleState.NOT_INSTALLED,
                ProModuleState.RETAINED_USE,
                ProModuleState.UPDATE_INELIGIBLE,
                ProModuleState.REMOVING,
                ProModuleState.ERROR);
        allow(values, ProModuleState.DOWNLOADING,
                ProModuleState.VERIFYING,
                ProModuleState.RELEASE_AVAILABLE,
                ProModuleState.ERROR);
        allow(values, ProModuleState.VERIFYING,
                ProModuleState.STARTING_CANDIDATE,
                ProModuleState.RELEASE_AVAILABLE,
                ProModuleState.ERROR);
        allow(values, ProModuleState.STARTING_CANDIDATE,
                ProModuleState.HEALTH_CHECKING,
                ProModuleState.ROLLING_BACK,
                ProModuleState.ERROR);
        allow(values, ProModuleState.HEALTH_CHECKING,
                ProModuleState.ACTIVE,
                ProModuleState.ROLLING_BACK,
                ProModuleState.ERROR);
        allow(values, ProModuleState.ACTIVE,
                ProModuleState.RELEASE_AVAILABLE,
                ProModuleState.DEGRADED,
                ProModuleState.RETAINED_USE,
                ProModuleState.UPDATE_INELIGIBLE,
                ProModuleState.REMOVING,
                ProModuleState.ERROR);
        allow(values, ProModuleState.DEGRADED,
                ProModuleState.ACTIVE,
                ProModuleState.RELEASE_AVAILABLE,
                ProModuleState.ROLLING_BACK,
                ProModuleState.RETAINED_USE,
                ProModuleState.UPDATE_INELIGIBLE,
                ProModuleState.REMOVING,
                ProModuleState.ERROR);
        allow(values, ProModuleState.ROLLING_BACK,
                ProModuleState.ACTIVE,
                ProModuleState.RELEASE_AVAILABLE,
                ProModuleState.NOT_INSTALLED,
                ProModuleState.ERROR);
        allow(values, ProModuleState.RETAINED_USE,
                ProModuleState.ACTIVE,
                ProModuleState.DEGRADED,
                ProModuleState.UPDATE_INELIGIBLE,
                ProModuleState.REMOVING,
                ProModuleState.ERROR);
        allow(values, ProModuleState.UPDATE_INELIGIBLE,
                ProModuleState.ACTIVE,
                ProModuleState.NOT_INSTALLED,
                ProModuleState.RELEASE_AVAILABLE,
                ProModuleState.REMOVING,
                ProModuleState.ERROR);
        allow(values, ProModuleState.REMOVING,
                ProModuleState.NOT_INSTALLED,
                ProModuleState.ERROR);
        allow(values, ProModuleState.ERROR,
                ProModuleState.NOT_INSTALLED,
                ProModuleState.RELEASE_AVAILABLE,
                ProModuleState.ROLLING_BACK,
                ProModuleState.REMOVING,
                ProModuleState.ERROR);
        return Map.copyOf(values);
    }

    private static void allow(
            Map<ProModuleState, EnumSet<ProModuleState>> values,
            ProModuleState from,
            ProModuleState... to) {
        values.put(from, EnumSet.copyOf(java.util.List.of(to)));
    }
}
