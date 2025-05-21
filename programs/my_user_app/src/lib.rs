use anchor_lang::prelude::*;

declare_id!("EJfiMorcTnMgyHvxpBe8EaBc7YG5p79xy4vLe2fPqV3B");

#[program]
pub mod task_manager {
    use super::*;

    pub fn create_task(ctx: Context<CreateTask>, id: u64, name: String) -> Result<()> {
        if name.chars().count() > MAX_NAME_LENGTH {
            return err!(ErrorCode::NameTooLong);
        }
        let task = &mut ctx.accounts.task_account;
        task.id = id;
        task.name = name;
        task.authority = *ctx.accounts.user.key;
        task.active = true;
        msg!("Task '{}' created with ID: {}", task.name, task.id);
        Ok(())
    }

    pub fn update_task_status(ctx: Context<UpdateTaskStatus>, new_status: bool) -> Result<()> {
        ctx.accounts.task_account.active = new_status;
        msg!("Task ID {} status updated to: {}", ctx.accounts.task_account.id, new_status);
        Ok(())
    }

    pub fn delete_task(ctx: Context<DeleteTask>) -> Result<()> {
        msg!("Task ID {} deleted by {}", ctx.accounts.task_account.id, ctx.accounts.authority_signer.key());
        Ok(())
    }
}

#[account]
pub struct TaskAccount {
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

impl TaskAccount {
    pub const LEN: usize = DISCRIMINATOR_LENGTH 
                         + U64_LENGTH 
                         + (STRING_PREFIX_LENGTH + MAX_NAME_LENGTH)
                         + PUBLIC_KEY_LENGTH
                         + BOOL_LENGTH;
}

#[derive(Accounts)]
#[instruction(id: u64, name: String)]
pub struct CreateTask<'info> {
    #[account(
        init, 
        payer = user, 
        space = TaskAccount::LEN, 
        seeds = [b"task_seed".as_ref(), id.to_le_bytes().as_ref()],
        bump
    )]
    pub task_account: Account<'info, TaskAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateTaskStatus<'info> {
    #[account(mut, has_one = authority @ ErrorCode::UnauthorizedAction)]
    pub task_account: Account<'info, TaskAccount>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct DeleteTask<'info> {
    #[account(
        mut, 
        close = authority_signer,
        constraint = task_account.authority == authority_signer.key() @ ErrorCode::UnauthorizedAction
    )]
    pub task_account: Account<'info, TaskAccount>,
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
