package com.autarkos.pro;

import java.time.Instant;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.autarkos.pro.models.ProModels;

@Service
public class ProService {

    private final ProSettingsRepository repository;
    private final Supplier<Instant> clock;
    private final boolean remoteApiConfigured;

    @Autowired
    public ProService(
            ProSettingsRepository repository,
            @Value("${autark-os.pro.api-base-url:}") String apiBaseUrl) {
        this(repository, Instant::now, apiBaseUrl != null && !apiBaseUrl.isBlank());
    }

    ProService(ProSettingsRepository repository, Supplier<Instant> clock, boolean remoteApiConfigured) {
        this.repository = repository;
        this.clock = clock;
        this.remoteApiConfigured = remoteApiConfigured;
    }

    public ProModels.ProStatus status() {
        ProModels.ProSettings settings = repository.settings()
                .orElseGet(() -> ProModels.ProSettings.defaults(clock.get()));
        return ProModels.ProStatus.from(settings, remoteApiConfigured, null);
    }
}
