package com.autarkos.pro;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ProRemoteClientConfigurationTests {

    @Test
    void selectsMockClientByDefaultWithoutRemoteUrl() {
        ProProperties properties = new ProProperties();
        ProRemoteClient client = new ProRemoteClientConfiguration().proRemoteClient(properties);

        assertThat(client).isInstanceOf(MockProRemoteClient.class);
        assertThat(properties.remoteApiConfigured()).isFalse();
    }

    @Test
    void selectsMockClientWhenMockModeIsExplicitEvenWithRemoteUrl() {
        ProProperties properties = new ProProperties();
        properties.setMockMode(true);
        properties.setApiBaseUrl("https://pro.autark.local");

        ProRemoteClient client = new ProRemoteClientConfiguration().proRemoteClient(properties);

        assertThat(client).isInstanceOf(MockProRemoteClient.class);
        assertThat(properties.remoteApiConfigured()).isFalse();
    }

    @Test
    void selectsSupabaseClientWhenMockModeIsOffAndRemoteUrlIsConfigured() {
        ProProperties properties = new ProProperties();
        properties.setMockMode(false);
        properties.setApiBaseUrl("https://pro.autark.local");

        ProRemoteClient client = new ProRemoteClientConfiguration().proRemoteClient(properties);

        assertThat(client).isInstanceOf(SupabaseProRemoteClient.class);
        assertThat(properties.remoteApiConfigured()).isTrue();
    }
}
