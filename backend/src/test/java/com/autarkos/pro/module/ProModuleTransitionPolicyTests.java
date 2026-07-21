package com.autarkos.pro.module;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.autarkos.pro.model.ProModuleState;

class ProModuleTransitionPolicyTests {

    @Test
    void everyStateTransitionMatchesTheExplicitLifecycleGraph() {
        ProModuleTransitionPolicy policy = new ProModuleTransitionPolicy();
        Map<ProModuleState, EnumSet<ProModuleState>> expected = expected();

        for (ProModuleState from : ProModuleState.values()) {
            for (ProModuleState to : ProModuleState.values()) {
                assertThat(policy.allowed(from, to))
                        .as("%s -> %s", from, to)
                        .isEqualTo(
                                from == to
                                        || expected.get(from).contains(to));
            }
        }
    }

    private static Map<ProModuleState, EnumSet<ProModuleState>> expected() {
        EnumMap<ProModuleState, EnumSet<ProModuleState>> expected =
                new EnumMap<>(ProModuleState.class);
        put(expected, ProModuleState.NOT_INSTALLED,
                ProModuleState.RELEASE_AVAILABLE,
                ProModuleState.UPDATE_INELIGIBLE,
                ProModuleState.ERROR);
        put(expected, ProModuleState.RELEASE_AVAILABLE,
                ProModuleState.DOWNLOADING,
                ProModuleState.ACTIVE,
                ProModuleState.NOT_INSTALLED,
                ProModuleState.RETAINED_USE,
                ProModuleState.UPDATE_INELIGIBLE,
                ProModuleState.REMOVING,
                ProModuleState.ERROR);
        put(expected, ProModuleState.DOWNLOADING,
                ProModuleState.VERIFYING,
                ProModuleState.RELEASE_AVAILABLE,
                ProModuleState.ERROR);
        put(expected, ProModuleState.VERIFYING,
                ProModuleState.STARTING_CANDIDATE,
                ProModuleState.RELEASE_AVAILABLE,
                ProModuleState.ERROR);
        put(expected, ProModuleState.STARTING_CANDIDATE,
                ProModuleState.HEALTH_CHECKING,
                ProModuleState.ROLLING_BACK,
                ProModuleState.ERROR);
        put(expected, ProModuleState.HEALTH_CHECKING,
                ProModuleState.ACTIVE,
                ProModuleState.ROLLING_BACK,
                ProModuleState.ERROR);
        put(expected, ProModuleState.ACTIVE,
                ProModuleState.RELEASE_AVAILABLE,
                ProModuleState.DEGRADED,
                ProModuleState.RETAINED_USE,
                ProModuleState.UPDATE_INELIGIBLE,
                ProModuleState.REMOVING,
                ProModuleState.ERROR);
        put(expected, ProModuleState.DEGRADED,
                ProModuleState.ACTIVE,
                ProModuleState.RELEASE_AVAILABLE,
                ProModuleState.ROLLING_BACK,
                ProModuleState.RETAINED_USE,
                ProModuleState.UPDATE_INELIGIBLE,
                ProModuleState.REMOVING,
                ProModuleState.ERROR);
        put(expected, ProModuleState.ROLLING_BACK,
                ProModuleState.ACTIVE,
                ProModuleState.RELEASE_AVAILABLE,
                ProModuleState.NOT_INSTALLED,
                ProModuleState.ERROR);
        put(expected, ProModuleState.RETAINED_USE,
                ProModuleState.ACTIVE,
                ProModuleState.DEGRADED,
                ProModuleState.UPDATE_INELIGIBLE,
                ProModuleState.REMOVING,
                ProModuleState.ERROR);
        put(expected, ProModuleState.UPDATE_INELIGIBLE,
                ProModuleState.ACTIVE,
                ProModuleState.NOT_INSTALLED,
                ProModuleState.RELEASE_AVAILABLE,
                ProModuleState.REMOVING,
                ProModuleState.ERROR);
        put(expected, ProModuleState.REMOVING,
                ProModuleState.NOT_INSTALLED,
                ProModuleState.ERROR);
        put(expected, ProModuleState.ERROR,
                ProModuleState.NOT_INSTALLED,
                ProModuleState.RELEASE_AVAILABLE,
                ProModuleState.ROLLING_BACK,
                ProModuleState.REMOVING,
                ProModuleState.ERROR);
        return expected;
    }

    private static void put(
            Map<ProModuleState, EnumSet<ProModuleState>> values,
            ProModuleState from,
            ProModuleState... to) {
        values.put(from, EnumSet.copyOf(java.util.List.of(to)));
    }
}
