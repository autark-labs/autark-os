package com.projectos.host;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;

import org.junit.jupiter.api.Test;

class LegacyHostInventoryApiDeletionTests {

    @Test
    void publicHostInventoryApiAndActionServiceAreDeletedAfterObservedServicesTakeOverRecovery() {
        assertMissing("com.projectos.apps.AppOwnershipController");
        assertMissing("com.projectos.host.HostInventoryController");
        assertMissing("com.projectos.host.DevHostInventoryController");
        assertMissing("com.projectos.host.HostResourceActionService");
    }

    @Test
    void hostInventoryProviderAndResourcesAreDeletedAfterSetupUsesObservedServices() {
        assertMissing("com.projectos.host.HostInventoryProvider");
        assertMissing("com.projectos.host.HostInventoryResource");
        assertMissing("com.projectos.host.HostInventoryService");
        assertMissing("com.projectos.host.HostInventoryIgnoreRepository");
    }

    @Test
    void appOwnershipAndDiscoverDtosDoNotCarryLegacyHostInventoryResources() {
        assertThat(recordComponentNames(com.projectos.apps.AppOwnershipView.class)).doesNotContain("foundResource");
        assertThat(recordComponentNames(com.projectos.discover.DiscoverAppView.class)).doesNotContain("foundResource");
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
