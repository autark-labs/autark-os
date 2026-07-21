package com.autarkos.pro.agent;

import com.autarkos.extensions.ExtensionSurfaceEnvelope;
import com.autarkos.extensions.ExtensionUiManifest;
import com.autarkos.pro.model.AgentStatus;
import com.autarkos.pro.model.NormalizedHostSnapshot;

public interface ProAgentClient {

    AgentStatus status(ProAgentEndpoint endpoint);

    ExtensionUiManifest uiManifest(ProAgentEndpoint endpoint);

    byte[] uiAsset(ProAgentEndpoint endpoint, String assetName);

    ExtensionSurfaceEnvelope renderSurface(
            ProAgentEndpoint endpoint,
            String surface,
            NormalizedHostSnapshot snapshot,
            String continuationToken);
}
