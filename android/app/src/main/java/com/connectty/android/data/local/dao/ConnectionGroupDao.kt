package com.connectty.android.data.local.dao

import androidx.room.*
import com.connectty.android.data.local.entity.ConnectionGroupEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ConnectionGroupDao {
    @Query("SELECT * FROM connection_groups ORDER BY name ASC")
    fun getAllGroups(): Flow<List<ConnectionGroupEntity>>

    @Query("SELECT * FROM connection_groups WHERE id = :id")
    suspend fun getGroupById(id: String): ConnectionGroupEntity?

    @Query("SELECT * FROM connection_groups WHERE parent_id IS NULL ORDER BY name ASC")
    fun getRootGroups(): Flow<List<ConnectionGroupEntity>>

    @Query("SELECT * FROM connection_groups WHERE parent_id = :parentId ORDER BY name ASC")
    fun getSubGroups(parentId: String): Flow<List<ConnectionGroupEntity>>

    @Query("SELECT * FROM connection_groups WHERE membership_type = :type ORDER BY name ASC")
    fun getGroupsByType(type: String): Flow<List<ConnectionGroupEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(group: ConnectionGroupEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(groups: List<ConnectionGroupEntity>)

    @Update
    suspend fun update(group: ConnectionGroupEntity)

    @Delete
    suspend fun delete(group: ConnectionGroupEntity)

    @Query("DELETE FROM connection_groups WHERE id = :id")
    suspend fun deleteById(id: String)
}
