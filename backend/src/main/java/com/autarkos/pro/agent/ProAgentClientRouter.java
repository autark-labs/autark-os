package com.autarkos.pro.agent;

import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.stereotype.Component;

import com.autarkos.extensions.ExtensionSurfaceEnvelope;
import com.autarkos.extensions.ExtensionUiManifest;
import com.autarkos.pro.model.AgentStatus;
import com.autarkos.pro.model.NormalizedHostSnapshot;

@Component
public final class ProAgentClientRouter {

    private final ProAgentClient client;
    private final AtomicReference<ProAgentEndpoint> active =
            new AtomicReference<>();

    public ProAgentClientRouter(ProAgentClient client) {
        this.client = Objects.requireNonNull(client);
    }

    public void activate(ProAgentEndpoint endpoint) {
        active.set(Objects.requireNonNull(endpoint));
    }

    public void clear() {
        active.set(null);
    }

    public Optional<ProAgentEndpoint> activeEndpoint() {
        return Optional.ofNullable(active.get());
    }

    public AgentStatus status() {
        return client.status(requireActive());
    }

    public ExtensionUiManifest uiManifest() {
        return client.uiManifest(requireActive());
    }

    public byte[] uiAsset(String assetName) {
        return client.uiAsset(requireActive(), assetName);
    }

    public ExtensionSurfaceEnvelope renderSurface(
            String surface,
            NormalizedHostSnapshot snapshot,
            String continuationToken) {
        return client.renderSurface(
                requireActive(),
                surface,
                snapshot,
                continuationToken);
    }

    private ProAgentEndpoint requireActive() {
        ProAgentEndpoint endpoint = active.get();
        if (endpoint == null) {
            throw new ProAgentClientException(
                    "agent_unavailable",
                    "Autark Pro agent is unavailable.");
        }
        return endpoint;
    }
}
