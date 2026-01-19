package com.connectty.android.data.local.dao

import androidx.room.*
import com.connectty.android.data.local.entity.SessionStateEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface SessionStateDao {
    @Query("SELECT * FROM session_states WHERE profile_id = :profileId ORDER BY updated_at DESC")
    fun getSessionStatesByProfile(profileId: String): Flow<List<SessionStateEntity>>

    @Query("SELECT * FROM session_states WHERE id = :id")
    suspend fun getSessionStateById(id: String): SessionStateEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(sessionState: SessionStateEntity)

    @Update
    suspend fun update(sessionState: SessionStateEntity)

    @Delete
    suspend fun delete(sessionState: SessionStateEntity)

    @Query("DELETE FROM session_states WHERE id = :id")
    suspend fun deleteById(id: String)
}
