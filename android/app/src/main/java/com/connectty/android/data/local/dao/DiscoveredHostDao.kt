package com.connectty.android.data.local.dao

import androidx.room.*
import com.connectty.android.data.local.entity.DiscoveredHostEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface DiscoveredHostDao {
    @Query("SELECT * FROM discovered_hosts ORDER BY name ASC")
    fun getAllHosts(): Flow<List<DiscoveredHostEntity>>

    @Query("SELECT * FROM discovered_hosts WHERE provider_id = :providerId ORDER BY name ASC")
    fun getHostsByProvider(providerId: String): Flow<List<DiscoveredHostEntity>>

    @Query("SELECT * FROM discovered_hosts WHERE imported = 0 ORDER BY name ASC")
    fun getUnimportedHosts(): Flow<List<DiscoveredHostEntity>>

    @Query("SELECT * FROM discovered_hosts WHERE id = :id")
    suspend fun getHostById(id: String): DiscoveredHostEntity?

    @Query("SELECT * FROM discovered_hosts WHERE provider_id = :providerId AND provider_host_id = :providerHostId")
    suspend fun getHostByProviderHostId(providerId: String, providerHostId: String): DiscoveredHostEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(host: DiscoveredHostEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(hosts: List<DiscoveredHostEntity>)

    @Update
    suspend fun update(host: DiscoveredHostEntity)

    @Delete
    suspend fun delete(host: DiscoveredHostEntity)

    @Query("DELETE FROM discovered_hosts WHERE provider_id = :providerId")
    suspend fun deleteByProvider(providerId: String)

    @Query("UPDATE discovered_hosts SET imported = 1, connection_id = :connectionId WHERE id = :id")
    suspend fun markAsImported(id: String, connectionId: String)
}
