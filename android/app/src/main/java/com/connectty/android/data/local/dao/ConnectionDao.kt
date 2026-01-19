package com.connectty.android.data.local.dao

import androidx.room.*
import com.connectty.android.data.local.entity.ConnectionEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ConnectionDao {
    @Query("SELECT * FROM connections ORDER BY name ASC")
    fun getAllConnections(): Flow<List<ConnectionEntity>>

    @Query("SELECT * FROM connections WHERE id = :id")
    suspend fun getConnectionById(id: String): ConnectionEntity?

    @Query("SELECT * FROM connections WHERE group_id = :groupId ORDER BY name ASC")
    fun getConnectionsByGroup(groupId: String): Flow<List<ConnectionEntity>>

    @Query("SELECT * FROM connections WHERE connection_type = :type ORDER BY name ASC")
    fun getConnectionsByType(type: String): Flow<List<ConnectionEntity>>

    @Query("SELECT * FROM connections WHERE provider_id = :providerId ORDER BY name ASC")
    fun getConnectionsByProvider(providerId: String): Flow<List<ConnectionEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(connection: ConnectionEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(connections: List<ConnectionEntity>)

    @Update
    suspend fun update(connection: ConnectionEntity)

    @Delete
    suspend fun delete(connection: ConnectionEntity)

    @Query("DELETE FROM connections WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("UPDATE connections SET last_connected_at = :timestamp WHERE id = :id")
    suspend fun updateLastConnectedAt(id: String, timestamp: Long)

    @Query("SELECT COUNT(*) FROM connections")
    suspend fun getConnectionCount(): Int
}
