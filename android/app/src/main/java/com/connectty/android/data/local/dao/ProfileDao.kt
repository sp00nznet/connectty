package com.connectty.android.data.local.dao

import androidx.room.*
import com.connectty.android.data.local.entity.ProfileEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ProfileDao {
    @Query("SELECT * FROM profiles ORDER BY name ASC")
    fun getAllProfiles(): Flow<List<ProfileEntity>>

    @Query("SELECT * FROM profiles WHERE id = :id")
    suspend fun getProfileById(id: String): ProfileEntity?

    @Query("SELECT * FROM profiles WHERE is_default = 1 LIMIT 1")
    suspend fun getDefaultProfile(): ProfileEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(profile: ProfileEntity)

    @Update
    suspend fun update(profile: ProfileEntity)

    @Delete
    suspend fun delete(profile: ProfileEntity)

    @Query("UPDATE profiles SET is_default = 0")
    suspend fun clearDefaultFlag()

    @Query("UPDATE profiles SET is_default = 1 WHERE id = :id")
    suspend fun setAsDefault(id: String)
}
