package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(properties = {
        "autark-os.guardian.enabled=false",
        "autark-os.backups.scheduler.enabled=false"
})
class StorageSampleRepositoryTests {

    @TempDir
    static Path runtimeRoot;

    @Autowired
    StorageSampleRepository repository;

    @DynamicPropertySource
    static void runtimeProperties(DynamicPropertyRegistry registry) {
        registry.add("autark-os.runtime-root", () -> runtimeRoot.toString());
    }

    @Test
    void recordsQueriesAndDeletesSamplesByAppAndTime() {
        Instant old = Instant.parse("2026-06-19T00:00:00Z");
        Instant current = Instant.parse("2026-06-19T01:00:00Z");

        repository.save(new StorageSampleEntity("vaultwarden", 100, old.toString()));
        repository.save(new StorageSampleEntity("vaultwarden", 200, current.toString()));
        repository.save(new StorageSampleEntity("gitea", 999, current.toString()));
        repository.deleteBefore(current.toString());

        assertThat(repository.forAppSince("vaultwarden", old.toString()))
                .extracting(StorageSampleEntity::usedBytes)
                .containsExactly(200L);
        assertThat(repository.forAppSince("gitea", old.toString()))
                .extracting(StorageSampleEntity::usedBytes)
                .containsExactly(999L);
    }
}
