use anchor_lang::prelude::*;

declare_id!("EJfiMorcTnMgyHvxpBe8EaBc7YG5p79xy4vLe2fPqV3B");

#[program]
pub mod entity_manager {
    use super::*;

    pub fn create_entity(ctx: Context<CreateEntity>, id: u64, name: String) -> Result<()> {
        if name.chars().count() > MAX_NAME_LENGTH {
            return err!(ErrorCode::NameTooLong);
        }
        let entity = &mut ctx.accounts.entity_account;
        entity.id = id;
        entity.name = name;
        entity.authority = *ctx.accounts.user.key;
        entity.active = true;
        msg!("Entity '{}' created with ID: {}", entity.name, entity.id);
        Ok(())
    }

    pub fn update_entity_status(ctx: Context<UpdateEntityStatus>, new_status: bool) -> Result<()> {
        ctx.accounts.entity_account.active = new_status;
        msg!("Entity ID {} status updated to: {}", ctx.accounts.entity_account.id, new_status);
        Ok(())
    }

    pub fn delete_entity(ctx: Context<DeleteEntity>) -> Result<()> {
        msg!("Entity ID {} deleted by {}", ctx.accounts.entity_account.id, ctx.accounts.authority_signer.key());
        Ok(())
    }
}

#[account]
pub struct EntityAccount {
    pub id: u64,
    pub name: String,
    pub authority: Pubkey,
    pub active: bool,
}

const MAX_NAME_LENGTH: usize = 50;
const DISCRIMINATOR_LENGTH: usize = 8;
const U64_LENGTH: usize = 8;
const STRING_PREFIX_LENGTH: usize = 4;
const PUBLIC_KEY_LENGTH: usize = 32;
const BOOL_LENGTH: usize = 1;

impl EntityAccount {
    pub const LEN: usize = DISCRIMINATOR_LENGTH 
                         + U64_LENGTH 
                         + (STRING_PREFIX_LENGTH + MAX_NAME_LENGTH)
                         + PUBLIC_KEY_LENGTH
                         + BOOL_LENGTH;
}

#[derive(Accounts)]
#[instruction(id: u64, name: String)]
pub struct CreateEntity<'info> {
    #[account(
        init, 
        payer = user, 
        space = EntityAccount::LEN, 
        seeds = [b"entity_seed".as_ref(), id.to_le_bytes().as_ref()],
        bump
    )]
    pub entity_account: Account<'info, EntityAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateEntityStatus<'info> {
    #[account(mut, has_one = authority @ ErrorCode::UnauthorizedAction)]
    pub entity_account: Account<'info, EntityAccount>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct DeleteEntity<'info> {
    #[account(
        mut, 
        close = authority_signer,
        constraint = entity_account.authority == authority_signer.key() @ ErrorCode::UnauthorizedAction
    )]
    pub entity_account: Account<'info, EntityAccount>,
    #[account(mut)] 
    pub authority_signer: Signer<'info>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Name is too long.")]
    NameTooLong,
    #[msg("Unauthorized action.")]
    UnauthorizedAction,
}
