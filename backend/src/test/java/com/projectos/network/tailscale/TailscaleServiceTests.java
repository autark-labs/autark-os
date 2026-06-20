package com.projectos.network.tailscale;

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
                    "HostName": "project-os",
                    "DNSName": "project-os.tail123.ts.net.",
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
                .containsExactly("project-os", "laptop", "phone");
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
        TailscaleService service = new TailscaleService(command -> {
            commands.add(Arrays.asList(command));
            String joined = String.join(" ", command);
            if (joined.equals("tailscale status --json")) {
                return new TailscaleService.CommandResult(0, List.of(connectedStatusJson()), false);
            }
            if (joined.equals("tailscale serve --bg --https=5984 http://127.0.0.1:5984") && commands.size() == 2) {
                return new TailscaleService.CommandResult(1, List.of(
                        "sending serve config: Access denied: serve config denied",
                        "Use 'sudo tailscale serve --bg --https=5984 http://127.0.0.1:5984'.",
                        "To not require root, use 'sudo tailscale set --operator=$USER' once."), false);
            }
            if (joined.startsWith("sudo -n tailscale set --operator=")) {
                return new TailscaleService.CommandResult(0, List.of("operator set"), false);
            }
            if (joined.equals("tailscale serve --bg --https=5984 http://127.0.0.1:5984")) {
                return new TailscaleService.CommandResult(0, List.of("available at https://project-os.tail123.ts.net:5984"), false);
            }
            return new TailscaleService.CommandResult(1, List.of("unexpected command " + joined), false);
        });

        TailscaleServeResult result = service.serveHttps(5984);

        assertThat(result.configured()).isTrue();
        assertThat(result.privateUrl()).isEqualTo("https://project-os.tail123.ts.net:5984");
        assertThat(commands)
                .anySatisfy(command -> assertThat(String.join(" ", command)).startsWith("sudo -n tailscale set --operator="));
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
            if (joined.startsWith("sudo -n tailscale")) {
                return new TailscaleService.CommandResult(1, List.of("sudo: a password is required"), false);
            }
            return new TailscaleService.CommandResult(1, List.of("unexpected command " + joined), false);
        });

        TailscaleServeResult result = service.serveHttps(5984);

        assertThat(result.configured()).isFalse();
        assertThat(result.message()).contains("sudo tailscale set --operator=");
        assertThat(result.privateUrl()).isEqualTo("https://project-os.tail123.ts.net:5984");
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
    void disableHttpsRemovesServeEndpointByPort() {
        List<List<String>> commands = new ArrayList<>();
        TailscaleService service = new TailscaleService(command -> {
            commands.add(Arrays.asList(command));
            String joined = String.join(" ", command);
            if (joined.equals("tailscale status --json")) {
                return new TailscaleService.CommandResult(0, List.of(connectedStatusJson()), false);
            }
            if (joined.equals("tailscale serve --https=5984 off")) {
                return new TailscaleService.CommandResult(0, List.of("removed"), false);
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
    void disableHttpsUsesSudoFallbackWhenOperatorPermissionIsMissing() {
        TailscaleService service = new TailscaleService(command -> {
            String joined = String.join(" ", command);
            if (joined.equals("tailscale status --json")) {
                return new TailscaleService.CommandResult(0, List.of(connectedStatusJson()), false);
            }
            if (joined.equals("tailscale serve --https=5984 off")) {
                return new TailscaleService.CommandResult(1, List.of("Access denied: serve config denied. Use sudo tailscale serve."), false);
            }
            if (joined.equals("sudo -n tailscale serve --https=5984 off")) {
                return new TailscaleService.CommandResult(0, List.of("removed with sudo"), false);
            }
            return new TailscaleService.CommandResult(1, List.of("unexpected command " + joined), false);
        });

        TailscaleServeResult result = service.disableHttps(5984);

        assertThat(result.configured()).isTrue();
        assertThat(result.message()).contains("elevated");
    }

    private String connectedStatusJson() {
        return """
                {
                  "BackendState": "Running",
                  "MagicDNSSuffix": "tail123.ts.net",
                  "Self": {
                    "ID": "self-id",
                    "HostName": "project-os",
                    "DNSName": "project-os.tail123.ts.net.",
                    "TailscaleIPs": ["100.64.0.1"],
                    "OS": "linux",
                    "Online": true,
                    "User": "owner@example.com"
                  }
                }
                """;
    }
}
