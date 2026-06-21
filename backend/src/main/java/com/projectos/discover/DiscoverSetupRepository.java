package com.projectos.discover;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.projectos.database.DatabaseBackedRepository;
import com.projectos.database.ProjectOsDatabase;
import com.projectos.marketplace.install.InstallationException;
import com.projectos.marketplace.runtime.RuntimeLayout;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

@Repository
public class DiscoverSetupRepository extends DatabaseBackedRepository {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    public DiscoverSetupRepository(ProjectOsDatabase database) {
        super(database);
    }

    public DiscoverSetupRepository(RuntimeLayout runtimeLayout) {
        this(new ProjectOsDatabase(runtimeLayout));
    }

    public void save(String appId, String catalogAppId, DiscoverSetupAnswers answers) {
        migrate();
        Instant now = Instant.now();
        Optional<DiscoverSetupRecord> existing = findByAppId(appId);
        Instant createdAt = existing.map(DiscoverSetupRecord::createdAt).orElse(now);
        String sql = """
                insert into discover_app_setup_answers(
                    app_id,
                    catalog_app_id,
                    display_name,
                    access_mode,
                    storage_mode,
                    backup_policy,
                    local_browser_port,
                    answers_json,
                    created_at,
                    updated_at
                )
                values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict(app_id) do update set
                    catalog_app_id = excluded.catalog_app_id,
                    display_name = excluded.display_name,
                    access_mode = excluded.access_mode,
                    storage_mode = excluded.storage_mode,
                    backup_policy = excluded.backup_policy,
                    local_browser_port = excluded.local_browser_port,
                    answers_json = excluded.answers_json,
                    updated_at = excluded.updated_at
                """;
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, appId);
            statement.setString(2, catalogAppId);
            statement.setString(3, answers.stringValue("displayName"));
            statement.setString(4, answers.stringValue("accessMode"));
            statement.setString(5, answers.stringValue("storageMode"));
            statement.setString(6, answers.stringValue("backupPolicy"));
            statement.setString(7, answers.stringValue("localBrowserPort").isBlank() ? "auto" : answers.stringValue("localBrowserPort"));
            statement.setString(8, answersJson(answers));
            statement.setString(9, createdAt.toString());
            statement.setString(10, now.toString());
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to save Discover setup answers.", exception);
        }
    }

    public Optional<DiscoverSetupRecord> findByAppId(String appId) {
        migrate();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("select * from discover_app_setup_answers where app_id = ?")) {
            statement.setString(1, appId);
            ResultSet resultSet = statement.executeQuery();
            return resultSet.next() ? Optional.of(record(resultSet)) : Optional.empty();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read Discover setup answers.", exception);
        }
    }

    private DiscoverSetupRecord record(ResultSet resultSet) throws SQLException {
        return new DiscoverSetupRecord(
                resultSet.getString("app_id"),
                resultSet.getString("catalog_app_id"),
                resultSet.getString("display_name"),
                resultSet.getString("access_mode"),
                resultSet.getString("storage_mode"),
                resultSet.getString("backup_policy"),
                resultSet.getString("local_browser_port"),
                new DiscoverSetupAnswers(answersMap(resultSet.getString("answers_json"))),
                Instant.parse(resultSet.getString("created_at")),
                Instant.parse(resultSet.getString("updated_at")));
    }

    private String answersJson(DiscoverSetupAnswers answers) {
        try {
            return objectMapper.writeValueAsString(answers.values() == null ? Map.of() : answers.values());
        } catch (JsonProcessingException exception) {
            throw new InstallationException("Unable to encode Discover setup answers.", exception);
        }
    }

    private Map<String, Object> answersMap(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {
            });
        } catch (JsonProcessingException exception) {
            throw new InstallationException("Unable to decode Discover setup answers.", exception);
        }
    }
}
