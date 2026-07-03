package com.autarkos.host;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;

import org.junit.jupiter.api.Test;

class LegacyHostInventoryApiDeletionTests {

    @Test
    void publicHostInventoryApiAndActionServiceAreDeletedAfterObservedServicesTakeOverRecovery() {
        assertMissing("com.autarkos.apps.AppOwnershipController");
        assertMissing("com.autarkos.host.HostInventoryController");
        assertMissing("com.autarkos.host.DevHostInventoryController");
        assertMissing("com.autarkos.host.HostResourceActionService");
    }

    @Test
    void hostInventoryProviderAndResourcesAreDeletedAfterSetupUsesObservedServices() {
        assertMissing("com.autarkos.host.HostInventoryProvider");
        assertMissing("com.autarkos.host.HostInventoryResource");
        assertMissing("com.autarkos.host.HostInventoryService");
        assertMissing("com.autarkos.host.HostInventoryIgnoreRepository");
    }

    @Test
    void appOwnershipAndDiscoverDtosDoNotCarryLegacyHostInventoryResources() {
        assertThat(recordComponentNames(com.autarkos.apps.AppOwnershipView.class)).doesNotContain("foundResource");
        assertThat(recordComponentNames(com.autarkos.discover.DiscoverAppView.class)).doesNotContain("foundResource");
    }

    private void assertMissing(String className) {
        assertThatThrownBy(() -> Class.forName(className))
                .isInstanceOf(ClassNotFoundException.class);
    }

    private java.util.List<String> recordComponentNames(Class<?> type) {
        return Arrays.stream(type.getRecordComponents())
                .map(java.lang.reflect.RecordComponent::getName)
                .toList();
    }
}
