package com.projectos.database;

import java.sql.Connection;
import java.sql.SQLException;

public abstract class DatabaseBackedRepository {

    private final ProjectOsDatabase database;

    protected DatabaseBackedRepository(ProjectOsDatabase database) {
        this.database = database;
    }

    protected void migrate() {
        database.migrate();
    }

    protected Connection connection() throws SQLException {
        return database.connection();
    }
}
