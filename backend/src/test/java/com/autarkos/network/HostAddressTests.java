package com.autarkos.network;

import static org.assertj.core.api.Assertions.assertThat;
import java.util.List;
import org.junit.jupiter.api.Test;

class HostAddressTests {
    @Test
    void excludesDockerAndVpnInterfacesAndPrefersLowestMetricDefaultRoute() {
        assertThat(HostAddress.defaultRouteInterface(List.of(
                "docker0 00000000 00000000 0003 0 0 0 00000000",
                "tailscale0 00000000 00000000 0003 0 0 0 00000000",
                "wlan0 00000000 00000000 0003 0 0 600 00000000",
                "eth0 00000000 00000000 0003 0 0 100 00000000"))).isEqualTo("eth0");
        assertThat(HostAddress.eligibleInterface("br-1234")).isFalse();
        assertThat(HostAddress.eligibleInterface("enp4s0")).isTrue();
    }

    @Test
    void probeKeepsPortAndPathWithoutUsingBrowserHostname() {
        assertThat(HostAddress.probeUrl("http://192.168.68.55:18384/status?x=1"))
                .isEqualTo("http://127.0.0.1:18384/status?x=1");
    }
}
