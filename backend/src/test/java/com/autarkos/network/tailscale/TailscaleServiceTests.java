package com.autarkos.network.tailscale;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;

class TailscaleServiceTests {

    @Test
    void staleDnsNameDoesNotMeanSignedIn() {
        var service = new TailscaleService(command -> new TailscaleService.CommandResult(0,
                List.of("{\"BackendState\":\"NeedsLogin\",\"Self\":{\"DNSName\":\"old.tailnet.ts.net\"}}"), false));
        assertThat(service.status().connected()).isFalse();
    }

    @Test
    void failedDeviceReadIsNotAHealthyEmptyList() {
        var service = new TailscaleService(command -> new TailscaleService.CommandResult(1, List.of("read failed"), false));
        org.assertj.core.api.Assertions.assertThatThrownBy(service::devices).hasMessageContaining("could not read");
    }

    @Test
    void statusSeparatesDnsCertificateAndServeEvidence() {
        var service = new TailscaleService(command -> {
            if (String.join(" ", command).equals("tailscale status --json")) {
                return new TailscaleService.CommandResult(0, List.of("""
                        {"BackendState":"Running","Self":{"DNSName":"host.tailnet.ts.net."},
                         "CurrentTailnet":{"MagicDNSEnabled":true},"CertDomains":[]}
                        """), false);
            }
            return new TailscaleService.CommandResult(0, List.of("{}"), false);
        });
        var status = service.status();
        assertThat(status.connected()).isTrue();
        assertThat(status.magicDnsReady()).isTrue();
        assertThat(status.httpsReady()).isFalse();
        assertThat(status.serveReady()).isFalse();
    }

    @Test
    void missingReadinessEvidenceStaysUnknownAndFailedStatusIsUnavailable() {
        var service = new TailscaleService(command -> String.join(" ", command).equals("tailscale status --json")
                ? new TailscaleService.CommandResult(0, List.of("{\"BackendState\":\"Running\",\"Self\":{\"DNSName\":\"host.tailnet.ts.net\"}}"), false)
                : new TailscaleService.CommandResult(1, List.of("read failed"), false));
        var status = service.status();
        assertThat(status.magicDnsReady()).isNull();
        assertThat(status.httpsReady()).isNull();
        assertThat(status.serveReady()).isNull();
        var failed = new TailscaleService(command -> new TailscaleService.CommandResult(1, List.of("read failed"), false));
        org.assertj.core.api.Assertions.assertThatThrownBy(failed::status)
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class).hasMessageContaining("could not read");
    }

    @Test
    void enrollmentUrlIsOnlyReturnedByTheGuideForThisHostsPendingLogin() throws Exception {
        for (String url : List.of("https://login.tailscale.com/a/test-enrollment", "https://example.test/a/test-enrollment", "javascript:alert(1)")) {
            var service = new TailscaleService(command -> new TailscaleService.CommandResult(0,
                    List.of("{\"BackendState\":\"NeedsLogin\",\"AuthURL\":\"" + url + "\"}"), false));
            var guide = service.connectGuide();
            assertThat(guide.enrollmentUrl()).isEqualTo(url.startsWith("https://login.tailscale.com/") ? url : null);
            assertThat(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(service.status()))
                    .doesNotContain("test-enrollment");
        }
    }

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
    void serveConfigParsesGetConfigEndpoints() {
        TailscaleService service = new TailscaleService(command -> {
            String joined = String.join(" ", command);
            if (joined.equals("tailscale serve status --json")) return new TailscaleService.CommandResult(0, List.of("{}"), false);
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
    void serveFailureKeepsPrivateCommandDetailOutOfActionMessage() {
        String output = "Could not connect to https://synthetic.tailnet.ts.net token=synthetic-token";
        TailscaleService service = new TailscaleService(command ->
                String.join(" ", command).equals("tailscale status --json")
                        ? new TailscaleService.CommandResult(0, List.of(connectedStatusJson()), false)
                        : (String.join(" ", command).contains("--json") || String.join(" ", command).contains("get-config"))
                            ? new TailscaleService.CommandResult(0, List.of("{}"), false)
                            : new TailscaleService.CommandResult(1, List.of(output), false));
        TailscaleServeResult result = service.serveHttps(8090, 14743);
        assertThat(result.configured()).isFalse();
        assertThat(result.message()).contains("could not create").doesNotContain("synthetic.tailnet", "synthetic-token");
        assertThat(result.output()).contains(output);
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

        TailscaleServeResult result = service.disableHttps(5984, 5984);

        assertThat(result.configured()).isTrue();
        assertThat(result.message()).contains("removed");
        assertThat(commands)
                .anySatisfy(command -> assertThat(String.join(" ", command)).isEqualTo("tailscale serve --https=5984 off"));
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

        TailscaleServeResult result = service.disableHttps(14743, 8090);

        assertThat(result.configured()).isTrue();
        assertThat(result.message()).contains("already removed");
        assertThat(commands).doesNotContain("tailscale serve --https=14743 off");
    }

    @Test
    void successfulNullStatusMeansNoServeConfigurationOnACleanHost() {
        var service = new TailscaleService(command -> new TailscaleService.CommandResult(0, List.of("null"), false));
        assertThat(service.serveConfig().available()).isTrue();
        assertThat(service.serveConfig().mappings()).isEmpty();
    }

    @Test
    void incompleteNodeReadCannotProveAnEndpointIsFree() {
        for (String nodeOutput : List.of("unavailable", "[]", "\"unexpected\"")) {
            List<String> commands = new ArrayList<>();
            var service = new TailscaleService(command -> {
                String joined = String.join(" ", command);
                commands.add(joined);
                if (joined.equals("tailscale status --json")) return new TailscaleService.CommandResult(0, List.of(connectedStatusJson()), false);
                if (joined.equals("tailscale serve status --json")) return new TailscaleService.CommandResult(nodeOutput.equals("unavailable") ? 1 : 0, List.of(nodeOutput), false);
                return new TailscaleService.CommandResult(0, List.of("{}"), false);
            });
            assertThat(service.serveHttps(8090, 14743).configured()).isFalse();
            assertThat(service.disableHttps(14743, 8090).configured()).isFalse();
            assertThat(commands).noneMatch(command -> command.contains("--https="));
        }
    }

    @Test
    void foreignProxyFileAndTcpMappingsAreNeverMutated() {
        for (String config : List.of(
                nodeServeStatusJson(14743, 9999),
                nodeServeStatusJson(14743, 8090).replace("\"HTTPS\"", "\"HTTP\""),
                nodeServeStatusJson(14743, 8090).replace("\"TCP\":", "\"AllowFunnel\":{\"autark-os.tail123.ts.net:14743\":true},\"TCP\":"),
                "{\"Services\":{\"svc:foreign\":" + nodeServeStatusJson(14743, 8090) + "}}",
                "{\"Foreground\":{\"session-foreign\":" + nodeServeStatusJson(14743, 8090) + "}}",
                nodeServeStatusJson(14743, 8090).replace("http://127.0.0.1:8090", "http://192.0.2.1:8090"),
                nodeServeStatusJson(14743, 8090).replace("\"/\"", "\"/other\""),
                "{\"Web\":{\"autark-os.tail123.ts.net:14743\":{\"Handlers\":{\"/\":{\"Path\":\"/private\"}}}},\"TCP\":{\"14743\":{\"HTTPS\":true}}}",
                "{\"TCP\":{\"14743\":{\"TCPForward\":\"localhost:8090\"}}}")) {
            List<String> commands = new ArrayList<>();
            var service = new TailscaleService(command -> {
                String joined = String.join(" ", command);
                commands.add(joined);
                return new TailscaleService.CommandResult(0, List.of(joined.equals("tailscale status --json") ? connectedStatusJson()
                        : joined.equals("tailscale serve status --json") ? config : "{}"), false);
            });
            assertThat(service.serveHttps(8090, 14743).configured()).isFalse();
            assertThat(service.disableHttps(14743, 8090).configured()).isFalse();
            assertThat(commands).noneMatch(command -> command.contains("--https="));
        }
    }

    @Test
    void unsupportedCertificatesCannotReportAConfiguredPrivateLink() {
        var service = new TailscaleService(command -> new TailscaleService.CommandResult(0,
                List.of(String.join(" ", command).equals("tailscale status --json")
                        ? connectedStatusJson().replace("[\"autark-os.tail123.ts.net\"]", "[]")
                        : nodeServeStatusJson(14743, 8090)), false));
        assertThat(service.serveHttps(8090, 14743).configured()).isFalse();
    }

    private String connectedStatusJson() {
        return """
                {
                  "BackendState": "Running",
                  "CurrentTailnet": {"MagicDNSEnabled": true},
                  "CertDomains": ["autark-os.tail123.ts.net"],
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
