package com.autarkos.network.tailscale;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;

class TailscaleServiceTests {

    @Test
    void parsesSelfAndPeersFromTailscaleStatusJson() {
        TailscaleService service = new TailscaleService(command -> new TailscaleService.CommandResult(0, List.of("""
                {
                  "BackendState": "Running",
                  "MagicDNSSuffix": "tail123.ts.net",
                  "Self": {
                    "ID": "self-id",
                    "HostName": "autark-os",
                    "DNSName": "autark-os.tail123.ts.net.",
                    "TailscaleIPs": ["100.64.0.1"],
                    "OS": "linux",
                    "Online": true,
                    "CurAddr": "198.51.100.10:41641",
                    "User": "owner@example.com"
                  },
                  "Peer": {
                    "nodekey:laptop": {
                      "ID": "laptop-id",
                      "HostName": "laptop",
                      "DNSName": "laptop.tail123.ts.net.",
                      "TailscaleIPs": ["100.64.0.2"],
                      "OS": "macOS",
                      "Online": true,
                      "Relay": "ord",
                      "LastSeen": "2026-06-12T15:31:00Z",
                      "User": "owner@example.com"
                    },
                    "nodekey:phone": {
                      "ID": "phone-id",
                      "HostName": "phone",
                      "TailscaleIPs": ["100.64.0.3"],
                      "OS": "iOS",
                      "Online": false,
                      "LastSeen": "2026-06-11T15:31:00Z"
                    }
                  }
                }
                """), false));

        List<TailscaleDevice> devices = service.devices();

        assertThat(devices).extracting(TailscaleDevice::name)
                .containsExactly("autark-os", "laptop", "phone");
        assertThat(devices.get(0).self()).isTrue();
        assertThat(devices.get(0).connectionType()).isEqualTo("direct");
        assertThat(devices.get(1).connectionType()).isEqualTo("relay");
        assertThat(devices.get(1).relay()).isEqualTo("ord");
        assertThat(devices.get(2).connectionType()).isEqualTo("offline");
        assertThat(devices.get(2).lastSeen()).isEqualTo("2026-06-11T15:31:00Z");
    }

    @Test
    void devicesAreEmptyWhenTailscaleIsUnavailable() {
        TailscaleService service = new TailscaleService(command -> new TailscaleService.CommandResult(127, List.of(), true));

        assertThat(service.devices()).isEmpty();
    }

    @Test
    void serveHttpsSetsOperatorWhenTailscaleDeniesServeConfig() {
        List<List<String>> commands = new ArrayList<>();
        int[] serveAttempts = { 0 };
        TailscaleService service = new TailscaleService(command -> {
            commands.add(Arrays.asList(command));
            String joined = String.join(" ", command);
            if (joined.equals("tailscale status --json")) {
                return new TailscaleService.CommandResult(0, List.of(connectedStatusJson()), false);
            }
            if (joined.equals("tailscale serve --bg --https=5984 http://127.0.0.1:5984")) {
                serveAttempts[0]++;
                if (serveAttempts[0] == 1) {
                    return new TailscaleService.CommandResult(1, List.of(
                            "changing settings via 'tailscale serve' requires operator permissions",
                            "Use 'sudo tailscale serve --bg --https=5984 http://127.0.0.1:5984'.",
                            "To not require root, use 'sudo tailscale set --operator=$USER' once."), false);
                }
                return new TailscaleService.CommandResult(0, List.of("available at https://autark-os.tail123.ts.net:5984"), false);
            }
            if (joined.equals("sudo -n /opt/autark-os/bin/autark-os-fileops configure-tailscale-operator")) {
                return new TailscaleService.CommandResult(0, List.of("operator set"), false);
            }
            if (joined.equals("tailscale serve status --json")) {
                return new TailscaleService.CommandResult(0, List.of(nodeServeStatusJson(5984, 5984)), false);
            }
            if (joined.equals("tailscale serve get-config --all")) {
                return new TailscaleService.CommandResult(0, List.of("{\"version\":\"0.0.1\"}"), false);
            }
            return new TailscaleService.CommandResult(1, List.of("unexpected command " + joined), false);
        }, "autarkos");

        TailscaleServeResult result = service.serveHttps(5984);

        assertThat(result.configured()).isTrue();
        assertThat(result.privateUrl()).isEqualTo("https://autark-os.tail123.ts.net:5984");
        assertThat(commands)
                .anySatisfy(command -> assertThat(String.join(" ", command))
                        .isEqualTo("sudo -n /opt/autark-os/bin/autark-os-fileops configure-tailscale-operator"));
    }

    @Test
    void serveHttpsReturnsOneTimeOperatorFixWhenElevationIsUnavailable() {
        TailscaleService service = new TailscaleService(command -> {
            String joined = String.join(" ", command);
            if (joined.equals("tailscale status --json")) {
                return new TailscaleService.CommandResult(0, List.of(connectedStatusJson()), false);
            }
            if (joined.equals("tailscale serve --bg --https=5984 http://127.0.0.1:5984")) {
                return new TailscaleService.CommandResult(1, List.of("Access denied: serve config denied. To not require root, use 'sudo tailscale set --operator=$USER' once."), false);
            }
            if (joined.equals("sudo -n /opt/autark-os/bin/autark-os-fileops configure-tailscale-operator")) {
                return new TailscaleService.CommandResult(1, List.of("sudo: a password is required"), false);
            }
            return new TailscaleService.CommandResult(1, List.of("unexpected command " + joined), false);
        }, "autarkos");

        TailscaleServeResult result = service.serveHttps(5984);

        assertThat(result.configured()).isFalse();
        assertThat(result.message()).contains("cannot manage Serve yet");
        assertThat(result.privateUrl()).isNull();
    }

    @Test
    void serveConfigParsesGetConfigEndpoints() {
        TailscaleService service = new TailscaleService(command -> {
            String joined = String.join(" ", command);
            if (joined.equals("tailscale serve get-config --all")) {
                return new TailscaleService.CommandResult(0, List.of("""
                        {
                          "version": "0.0.1",
                          "services": {
                            "svc:vaultwarden": {
                              "endpoints": {
                                "tcp:8090": "http://127.0.0.1:8090"
                              }
                            },
                            "svc:obsidian": {
                              "endpoints": {
                                "tcp:5984": "http://localhost:5984"
                              }
                            }
                          }
                        }
                        """), false);
            }
            return new TailscaleService.CommandResult(1, List.of("unexpected command " + joined), false);
        });

        TailscaleServeConfig config = service.serveConfig();

        assertThat(config.available()).isTrue();
        assertThat(config.mappings()).hasSize(2);
        assertThat(config.mappings())
                .anySatisfy(mapping -> {
                    assertThat(mapping.serviceName()).isEqualTo("svc:vaultwarden");
                    assertThat(mapping.servePort()).isEqualTo(8090);
                    assertThat(mapping.targetPort()).isEqualTo(8090);
                    assertThat(mapping.target()).isEqualTo("http://127.0.0.1:8090");
                });
    }

    @Test
    void serveConfigFallsBackToStatusJson() {
        TailscaleService service = new TailscaleService(command -> {
            String joined = String.join(" ", command);
            if (joined.equals("tailscale serve get-config --all")) {
                return new TailscaleService.CommandResult(1, List.of("get-config unavailable"), false);
            }
            if (joined.equals("tailscale serve status --json")) {
                return new TailscaleService.CommandResult(0, List.of("""
                        {
                          "Services": {
                            "svc:jellyfin": {
                              "Endpoints": {
                                "tcp:8096": "http://127.0.0.1:8096"
                              }
                            }
                          }
                        }
                        """), false);
            }
            return new TailscaleService.CommandResult(1, List.of("unexpected command " + joined), false);
        });

        TailscaleServeConfig config = service.serveConfig();

        assertThat(config.available()).isTrue();
        assertThat(config.mappings())
                .anySatisfy(mapping -> {
                    assertThat(mapping.serviceName()).isEqualTo("svc:jellyfin");
                    assertThat(mapping.servePort()).isEqualTo(8096);
                    assertThat(mapping.targetPort()).isEqualTo(8096);
                });
    }

    @Test
    void serveConfigParsesCurrentNodeTcpAndWebShapeEvenWhenGetConfigIsEmpty() {
        TailscaleService service = new TailscaleService(command -> {
            String joined = String.join(" ", command);
            if (joined.equals("tailscale serve status --json")) {
                return new TailscaleService.CommandResult(0, List.of(nodeServeStatusJson(14743, 8090)), false);
            }
            if (joined.equals("tailscale serve get-config --all")) {
                return new TailscaleService.CommandResult(0, List.of("{\"version\":\"0.0.1\"}"), false);
            }
            return new TailscaleService.CommandResult(1, List.of("unexpected command " + joined), false);
        });

        TailscaleServeConfig config = service.serveConfig();

        assertThat(config.available()).isTrue();
        assertThat(config.mappings()).singleElement().satisfies(mapping -> {
            assertThat(mapping.servePort()).isEqualTo(14743);
            assertThat(mapping.targetPort()).isEqualTo(8090);
            assertThat(mapping.target()).isEqualTo("http://127.0.0.1:8090");
            assertThat(mapping.endpoint()).isEqualTo("https://autark-os.tail123.ts.net:14743/");
        });
    }

    @Test
    void successfulServeCommandDoesNotPublishUrlUntilMappingIsVerified() {
        TailscaleService service = new TailscaleService(command -> {
            String joined = String.join(" ", command);
            if (joined.equals("tailscale status --json")) {
                return new TailscaleService.CommandResult(0, List.of(connectedStatusJson()), false);
            }
            if (joined.equals("tailscale serve --bg --https=14743 http://127.0.0.1:8090")) {
                return new TailscaleService.CommandResult(0, List.of("Serve started"), false);
            }
            if (joined.equals("tailscale serve status --json") || joined.equals("tailscale serve get-config --all")) {
                return new TailscaleService.CommandResult(0, List.of("{}"), false);
            }
            return new TailscaleService.CommandResult(1, List.of("unexpected command " + joined), false);
        });

        TailscaleServeResult result = service.serveHttps(8090, 14743);

        assertThat(result.configured()).isFalse();
        assertThat(result.privateUrl()).isNull();
        assertThat(result.message()).contains("could not verify the live mapping");
    }

    @Test
    void disableHttpsRemovesServeEndpointByPort() {
        List<List<String>> commands = new ArrayList<>();
        boolean[] removed = { false };
        TailscaleService service = new TailscaleService(command -> {
            commands.add(Arrays.asList(command));
            String joined = String.join(" ", command);
            if (joined.equals("tailscale status --json")) {
                return new TailscaleService.CommandResult(0, List.of(connectedStatusJson()), false);
            }
            if (joined.equals("tailscale serve --https=5984 off")) {
                removed[0] = true;
                return new TailscaleService.CommandResult(0, List.of("removed"), false);
            }
            if (joined.equals("tailscale serve status --json")) {
                return new TailscaleService.CommandResult(0, List.of(removed[0] ? "{}" : nodeServeStatusJson(5984, 5984)), false);
            }
            if (joined.equals("tailscale serve get-config --all")) {
                return new TailscaleService.CommandResult(0, List.of("{}"), false);
            }
            return new TailscaleService.CommandResult(1, List.of("unexpected command " + joined), false);
        });

        TailscaleServeResult result = service.disableHttps(5984);

        assertThat(result.configured()).isTrue();
        assertThat(result.message()).contains("removed");
        assertThat(commands)
                .anySatisfy(command -> assertThat(String.join(" ", command)).isEqualTo("tailscale serve --https=5984 off"));
    }

    @Test
    void disableHttpsConfiguresOperatorThenRetriesWithoutRunningArbitraryServeAsRoot() {
        int[] removeAttempts = { 0 };
        boolean[] removed = { false };
        List<String> commands = new ArrayList<>();
        TailscaleService service = new TailscaleService(command -> {
            String joined = String.join(" ", command);
            commands.add(joined);
            if (joined.equals("tailscale status --json")) {
                return new TailscaleService.CommandResult(0, List.of(connectedStatusJson()), false);
            }
            if (joined.equals("tailscale serve status --json")) {
                return new TailscaleService.CommandResult(0, List.of(removed[0] ? "{}" : nodeServeStatusJson(5984, 5984)), false);
            }
            if (joined.equals("tailscale serve get-config --all")) {
                return new TailscaleService.CommandResult(0, List.of("{}"), false);
            }
            if (joined.equals("tailscale serve --https=5984 off")) {
                removeAttempts[0]++;
                if (removeAttempts[0] == 1) {
                    return new TailscaleService.CommandResult(1, List.of("Access denied: serve config denied. Use sudo tailscale serve."), false);
                }
                removed[0] = true;
                return new TailscaleService.CommandResult(0, List.of("removed"), false);
            }
            if (joined.equals("sudo -n /opt/autark-os/bin/autark-os-fileops configure-tailscale-operator")) {
                return new TailscaleService.CommandResult(0, List.of("operator configured"), false);
            }
            return new TailscaleService.CommandResult(1, List.of("unexpected command " + joined), false);
        }, "autarkos");

        TailscaleServeResult result = service.disableHttps(5984);

        assertThat(result.configured()).isTrue();
        assertThat(result.message()).contains("removed");
        assertThat(commands).contains("sudo -n /opt/autark-os/bin/autark-os-fileops configure-tailscale-operator");
        assertThat(commands).noneMatch(command -> command.startsWith("sudo -n tailscale serve"));
    }

    @Test
    void disableHttpsIsIdempotentWhenHandlerIsAlreadyAbsent() {
        List<String> commands = new ArrayList<>();
        TailscaleService service = new TailscaleService(command -> {
            String joined = String.join(" ", command);
            commands.add(joined);
            if (joined.equals("tailscale status --json")) {
                return new TailscaleService.CommandResult(0, List.of(connectedStatusJson()), false);
            }
            if (joined.equals("tailscale serve status --json") || joined.equals("tailscale serve get-config --all")) {
                return new TailscaleService.CommandResult(0, List.of("{}"), false);
            }
            return new TailscaleService.CommandResult(1, List.of("unexpected command " + joined), false);
        });

        TailscaleServeResult result = service.disableHttps(14743);

        assertThat(result.configured()).isTrue();
        assertThat(result.message()).contains("already removed");
        assertThat(commands).doesNotContain("tailscale serve --https=14743 off");
    }

    private String connectedStatusJson() {
        return """
                {
                  "BackendState": "Running",
                  "MagicDNSSuffix": "tail123.ts.net",
                  "Self": {
                    "ID": "self-id",
                    "HostName": "autark-os",
                    "DNSName": "autark-os.tail123.ts.net.",
                    "TailscaleIPs": ["100.64.0.1"],
                    "OS": "linux",
                    "Online": true,
                    "User": "owner@example.com"
                  }
                }
                """;
    }

    private String nodeServeStatusJson(int httpsPort, int localPort) {
        return """
                {
                  "TCP": {
                    "%d": {
                      "HTTPS": true
                    }
                  },
                  "Web": {
                    "autark-os.tail123.ts.net:%d": {
                      "Handlers": {
                        "/": {
                          "Proxy": "http://127.0.0.1:%d"
                        }
                      }
                    }
                  }
                }
                """.formatted(httpsPort, httpsPort, localPort);
    }
}
