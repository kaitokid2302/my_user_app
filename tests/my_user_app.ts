import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TaskManager } from "../target/types/task_manager";
import { expect } from "chai";
import BN from "bn.js";

describe("task_manager", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.taskManager as Program<TaskManager>;
  const user = provider.wallet as anchor.Wallet;

  const taskId = new BN(1);
  let taskPda: anchor.web3.PublicKey;
  let bump: number;

  before(async () => {
    [taskPda, bump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("task_seed"), taskId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
  });

  it("Creates a task", async () => {
    const taskName = "Test Task";

    await program.methods
      .createTask(taskId, taskName)
      .accounts({
        taskAccount: taskPda,
        user: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.payer])
      .rpc();

    const accountData = await program.account.taskAccount.fetch(taskPda);
    expect(accountData.id.eq(taskId)).to.be.true;
    expect(accountData.name).to.equal(taskName);
    expect(accountData.authority.equals(user.publicKey)).to.be.true;
    expect(accountData.active).to.be.true;
    console.log("Task created:", accountData);
  });

  it("Updates a task status", async () => {
    try {
      await program.account.taskAccount.fetch(taskPda);
    } catch (e) {
      console.log(
        "Task not found from previous test, creating one for update test..."
      );
      const taskName = "Update Test Task";
      await program.methods
        .createTask(taskId, taskName)
        .accounts({
          taskAccount: taskPda,
          user: user.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user.payer])
        .rpc();
      console.log("Task created for update test.");
    }
    
    const newStatus = false;
    await program.methods
      .updateTaskStatus(newStatus)
      .accounts({
        taskAccount: taskPda,
        authority: user.publicKey,
      })
      .signers([user.payer])
      .rpc();

    const accountData = await program.account.taskAccount.fetch(taskPda);
    expect(accountData.active).to.equal(newStatus);
    console.log("Task status updated to inactive:", accountData);
  });

  it("Updates a task status from inactive to active", async () => {
    // First make sure we have a task and it's inactive
    let accountData;
    try {
      accountData = await program.account.taskAccount.fetch(taskPda);
      if (accountData.active) {
        // If it's active, make it inactive first
        await program.methods
          .updateTaskStatus(false)
          .accounts({
            taskAccount: taskPda,
            authority: user.publicKey,
          })
          .signers([user.payer])
          .rpc();
        console.log("Set task to inactive as preparation");
      }
    } catch (e) {
      console.log("Task not found, creating a new inactive task...");
      const taskName = "Inactive Test Task";
      await program.methods
        .createTask(taskId, taskName)
        .accounts({
          taskAccount: taskPda,
          user: user.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user.payer])
        .rpc();
      
      // Set it to inactive
      await program.methods
        .updateTaskStatus(false)
        .accounts({
          taskAccount: taskPda,
          authority: user.publicKey,
        })
        .signers([user.payer])
        .rpc();
      console.log("Created inactive task for test");
    }
    
    // Verify task is inactive before update
    accountData = await program.account.taskAccount.fetch(taskPda);
    expect(accountData.active).to.be.false;
    
    // Now update status to active
    const newStatus = true;
    await program.methods
      .updateTaskStatus(newStatus)
      .accounts({
        taskAccount: taskPda,
        authority: user.publicKey,
      })
      .signers([user.payer])
      .rpc();

    // Verify task is now active
    accountData = await program.account.taskAccount.fetch(taskPda);
    expect(accountData.active).to.equal(newStatus);
    console.log("Task status updated to active:", accountData);
  });

  it("Fails to update task status with wrong authority", async () => {
    const anotherUser = anchor.web3.Keypair.generate();
 
    await provider.connection.requestAirdrop(
      anotherUser.publicKey,
      anchor.web3.LAMPORTS_PER_SOL / 10
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      await program.methods
        .updateTaskStatus(true)
        .accounts({
          taskAccount: taskPda,
          authority: anotherUser.publicKey,
        })
        .signers([anotherUser])
        .rpc();
      expect.fail("Should have failed due to unauthorized action");
    } catch (error) {
      expect(error).to.be.an("error");

      console.log("Successfully failed to update with wrong authority.");
    }
  });

  it("Deletes a task", async () => {
    try {
      await program.account.taskAccount.fetch(taskPda);
    } catch (e) {
      console.log(
        "Task not found from previous test, creating one for delete test..."
      );
      const taskName = "Delete Test Task";
      await program.methods
        .createTask(taskId, taskName)
        .accounts({
          taskAccount: taskPda,
          user: user.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user.payer])
        .rpc();
      console.log("Task created for delete test.");
    }

    const balanceBefore = await provider.connection.getBalance(user.publicKey);
    console.log(
      `User balance before deletion: ${
        balanceBefore / anchor.web3.LAMPORTS_PER_SOL
      } SOL`
    );

    await program.methods
      .deleteTask()
      .accounts({
        taskAccount: taskPda,
        authoritySigner: user.publicKey,
      })
      .signers([user.payer])
      .rpc();

    const balanceAfter = await provider.connection.getBalance(user.publicKey);
    console.log(
      `User balance after deletion: ${
        balanceAfter / anchor.web3.LAMPORTS_PER_SOL
      } SOL`
    );

    expect(balanceAfter).to.be.greaterThan(balanceBefore);
    console.log(
      `SOL returned to user: ${
        (balanceAfter - balanceBefore) / anchor.web3.LAMPORTS_PER_SOL
      } SOL`
    );

    try {
      await program.account.taskAccount.fetch(taskPda);
      expect.fail("Task account should have been closed");
    } catch (error) {
      expect(error.message).to.include("Account does not exist");
      console.log("Task successfully deleted.");
    }
  });

  it("Fails to delete task with wrong authority", async () => {
    const testDeleteId = new BN(2);
    let testDeletePda: anchor.web3.PublicKey;
    [testDeletePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("task_seed"), testDeleteId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    console.log("Creating task for wrong authority delete test...");
    await program.methods
      .createTask(testDeleteId, "Temp Task for Delete Fail Test")
      .accounts({
        taskAccount: testDeletePda,
        user: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.payer])
      .rpc();
    console.log("Task created for wrong authority delete test.");

    const anotherUser = anchor.web3.Keypair.generate();
 
    await provider.connection.requestAirdrop(
      anotherUser.publicKey,
      anchor.web3.LAMPORTS_PER_SOL / 10
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      await program.methods
        .deleteTask()
        .accounts({
          taskAccount: testDeletePda,
          authoritySigner: anotherUser.publicKey,
        })
        .signers([anotherUser])
        .rpc();
      expect.fail("Should have failed due to unauthorized action");
    } catch (error) {
      expect(error).to.be.an("error");

      console.log("Successfully failed to delete with wrong authority.");
    }

    try {
      const acc = await program.account.taskAccount.fetch(testDeletePda);
      if (acc) {
        console.log(
          "Cleaning up task from 'Fails to delete task with wrong authority' test..."
        );
        await program.methods
          .deleteTask()
          .accounts({
            taskAccount: testDeletePda,
            authoritySigner: user.publicKey,
          })
          .signers([user.payer])
          .rpc();
        console.log("Cleanup successful.");
      }
    } catch (e) {
      console.log(
        "Cleanup: Task for 'Fails to delete task with wrong authority' test already gone or never created properly."
      );
    }
  });

  it("Fails to create a task with too long name", async () => {
    const tooLongTaskId = new BN(999);
    const [tooLongTaskPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("task_seed"),
        tooLongTaskId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const tooLongName = "A".repeat(100);

    try {
      await program.methods
        .createTask(tooLongTaskId, tooLongName)
        .accounts({
          taskAccount: tooLongTaskPda,
          user: user.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user.payer])
        .rpc();
      expect.fail("Should have failed due to name too long");
    } catch (error) {
      expect(error).to.be.an("error");

      expect(error.toString()).to.include("NameTooLong");
      console.log("Successfully failed to create task with too long name.");
    }
  });

  it("Fails to update a non-existent task", async () => {
    const nonExistentId = new BN(12345);
    const [nonExistentPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("task_seed"), nonExistentId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    try {
      await program.methods
        .updateTaskStatus(true)
        .accounts({
          taskAccount: nonExistentPda,
          authority: user.publicKey,
        })
        .signers([user.payer])
        .rpc();
      expect.fail("Should have failed because task does not exist");
    } catch (error) {
      expect(error).to.be.an("error");

      console.log("Error message:", error.toString());
      console.log("Successfully failed to update non-existent task.");
    }
  });
});
