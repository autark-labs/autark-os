package com.autarkos.pro.snapshot;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.autarkos.pro.model.NormalizedHostSnapshot;
import com.autarkos.system.ProjectSettings;
import com.autarkos.system.ProjectVersionInfo;
import com.fasterxml.jackson.databind.ObjectMapper;

class NormalizedHostSnapshotAssemblerTests {

    private static final Instant NOW =
            Instant.parse("2026-07-20T12:00:00Z");

    @Test
    void producesDeterministicBoundedSnapshotWithoutPrivateHistory() {
        NormalizedHostSnapshotSource source = source();
        NormalizedHostSnapshotAssembler assembler = assembler(source);

        NormalizedHostSnapshot first = assembler.assemble();
        NormalizedHostSnapshot second = assembler.assemble();

        assertThat(first).isEqualTo(second);
        assertThat(first.snapshotId())
                .matches("^[0-9a-f-]{36}$");
        assertThat(first.storage().apps()).isEmpty();
        assertThat(first.recentMutations()).isEmpty();
    }

    @Test
    void exportsOnlyAllowlistedRawConfigurationValues() throws Exception {
        NormalizedHostSnapshotSource source = source();
        when(source.version()).thenReturn(new ProjectVersionInfo(
                "1.2.3",
                "secret-build-sha",
                "secret-build-date",
                "/secret/install/path",
                "/secret/runtime/path",
                "secret-installation-id",
                "secret-slug",
                "secret-runtime-root",
                "secret-backend-jar",
                "stable",
                "current",
                "secret-message",
                NOW));
        when(source.agentVersion()).thenReturn("2.3.4");
        when(source.settings()).thenReturn(ProjectSettings.defaults(
                "secret-device-name"));

        NormalizedHostSnapshot snapshot = assembler(source).assemble();
        String serialized = mapper().writeValueAsString(snapshot);

        assertThat(snapshot.configuration())
                .extracting(
                        NormalizedHostSnapshot.ConfigurationSnapshot
                                ::fieldId)
                .contains(
                        "core.version",
                        "agent.version",
                        "defaults.access")
                .doesNotContain("device.name");
        assertThat(serialized)
                .doesNotContain(
                        "secret-build-sha",
                        "/secret/",
                        "secret-installation-id",
                        "secret-device-name");
    }

    @Test
    void acceptsOnlyRecentStructuredApiMutations() {
        NormalizedHostSnapshot snapshot = assembler(source()).assemble(
                List.of(
                        new ProSnapshotMutation(
                                "PATCH",
                                "/api/system/settings",
                                "event_settings_01",
                                NOW.minusSeconds(10)),
                        new ProSnapshotMutation(
                                "GET",
                                "/api/system/settings",
                                "event_read_01",
                                NOW.minusSeconds(5)),
                        new ProSnapshotMutation(
                                "POST",
                                "/not-api",
                                "event_invalid_01",
                                NOW.minusSeconds(5)),
                        new ProSnapshotMutation(
                                "DELETE",
                                "/api/apps/example",
                                "event_old_01",
                                NOW.minusSeconds(31L * 24 * 60 * 60))));

        assertThat(snapshot.recentMutations())
                .containsExactly(new NormalizedHostSnapshot.MutationSnapshot(
                        "PATCH",
                        "/api/system/settings",
                        NOW.minusSeconds(10),
                        "event_settings_01"));
        assertThat(snapshot.partial()).isTrue();
    }

    @Test
    void capsMutationContextAtContractLimit() {
        List<ProSnapshotMutation> mutations =
                java.util.stream.IntStream.range(0, 64)
                        .mapToObj(index -> new ProSnapshotMutation(
                                "POST",
                                "/api/apps/example/restart",
                                "event_" + index,
                                NOW.minusSeconds(index)))
                        .toList();

        NormalizedHostSnapshot snapshot =
                assembler(source()).assemble(mutations);

        assertThat(snapshot.recentMutations())
                .hasSize(NormalizedHostSnapshotAssembler.MAX_MUTATIONS);
        assertThat(snapshot.partial()).isTrue();
    }

    private static NormalizedHostSnapshotAssembler assembler(
            NormalizedHostSnapshotSource source) {
        return new NormalizedHostSnapshotAssembler(
                source,
                () -> NOW,
                mapper());
    }

    private static NormalizedHostSnapshotSource source() {
        return mock(NormalizedHostSnapshotSource.class);
    }

    private static ObjectMapper mapper() {
        return new ObjectMapper().findAndRegisterModules();
    }
}
