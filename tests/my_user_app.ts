import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { EntityManager } from "../target/types/entity_manager";
import { expect } from "chai";
import BN from "bn.js";

describe("entity_manager", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.entityManager as Program<EntityManager>;
  const user = provider.wallet as anchor.Wallet;

  const entityId = new BN(1);
  let entityPda: anchor.web3.PublicKey;
  let bump: number;

  before(async () => {
    [entityPda, bump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("entity_seed"), entityId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
  });

  it("Creates an entity", async () => {
    const entityName = "Test Entity";

    await program.methods
      .createEntity(entityId, entityName)
      .accounts({
        entityAccount: entityPda,
        user: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.payer])
      .rpc();

    const accountData = await program.account.entityAccount.fetch(entityPda);
    expect(accountData.id.eq(entityId)).to.be.true;
    expect(accountData.name).to.equal(entityName);
    expect(accountData.authority.equals(user.publicKey)).to.be.true;
    expect(accountData.active).to.be.true;
    console.log("Entity created:", accountData);
  });

  it("Updates an entity status", async () => {
    try {
      await program.account.entityAccount.fetch(entityPda);
    } catch (e) {
      console.log(
        "Entity not found from previous test, creating one for update test..."
      );
      const entityName = "Update Test Entity";
      await program.methods
        .createEntity(entityId, entityName)
        .accounts({
          entityAccount: entityPda,
          user: user.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user.payer])
        .rpc();
      console.log("Entity created for update test.");
    }

    const newStatus = false;
    await program.methods
      .updateEntityStatus(newStatus)
      .accounts({
        entityAccount: entityPda,
        authority: user.publicKey,
      })
      .signers([user.payer])
      .rpc();

    const accountData = await program.account.entityAccount.fetch(entityPda);
    expect(accountData.active).to.equal(newStatus);
    console.log("Entity status updated:", accountData);
  });

  it("Fails to update entity status with wrong authority", async () => {
    const anotherUser = anchor.web3.Keypair.generate();

    await provider.connection.requestAirdrop(
      anotherUser.publicKey,
      anchor.web3.LAMPORTS_PER_SOL / 10
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      await program.methods
        .updateEntityStatus(true)
        .accounts({
          entityAccount: entityPda,
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

  it("Deletes an entity", async () => {
    try {
      await program.account.entityAccount.fetch(entityPda);
    } catch (e) {
      console.log(
        "Entity not found from previous test, creating one for delete test..."
      );
      const entityName = "Delete Test Entity";
      await program.methods
        .createEntity(entityId, entityName)
        .accounts({
          entityAccount: entityPda,
          user: user.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user.payer])
        .rpc();
      console.log("Entity created for delete test.");
    }

    const balanceBefore = await provider.connection.getBalance(user.publicKey);
    console.log(
      `User balance before deletion: ${
        balanceBefore / anchor.web3.LAMPORTS_PER_SOL
      } SOL`
    );

    await program.methods
      .deleteEntity()
      .accounts({
        entityAccount: entityPda,
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
      await program.account.entityAccount.fetch(entityPda);
      expect.fail("Entity account should have been closed");
    } catch (error) {
      expect(error.message).to.include("Account does not exist");
      console.log("Entity successfully deleted.");
    }
  });

  it("Fails to delete entity with wrong authority", async () => {
    const testDeleteId = new BN(2);
    let testDeletePda: anchor.web3.PublicKey;
    [testDeletePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("entity_seed"), testDeleteId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    console.log("Creating entity for wrong authority delete test...");
    await program.methods
      .createEntity(testDeleteId, "Temp Entity for Delete Fail Test")
      .accounts({
        entityAccount: testDeletePda,
        user: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user.payer])
      .rpc();
    console.log("Entity created for wrong authority delete test.");

    const anotherUser = anchor.web3.Keypair.generate();

    await provider.connection.requestAirdrop(
      anotherUser.publicKey,
      anchor.web3.LAMPORTS_PER_SOL / 10
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      await program.methods
        .deleteEntity()
        .accounts({
          entityAccount: testDeletePda,
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
      const acc = await program.account.entityAccount.fetch(testDeletePda);
      if (acc) {
        console.log(
          "Cleaning up entity from 'Fails to delete entity with wrong authority' test..."
        );
        await program.methods
          .deleteEntity()
          .accounts({
            entityAccount: testDeletePda,
            authoritySigner: user.publicKey,
          })
          .signers([user.payer])
          .rpc();
        console.log("Cleanup successful.");
      }
    } catch (e) {
      console.log(
        "Cleanup: Entity for 'Fails to delete entity with wrong authority' test already gone or never created properly."
      );
    }
  });

  it("Fails to create an entity with too long name", async () => {
    const tooLongEntityId = new BN(999);
    const [tooLongEntityPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("entity_seed"),
        tooLongEntityId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const tooLongName = "A".repeat(100);

    try {
      await program.methods
        .createEntity(tooLongEntityId, tooLongName)
        .accounts({
          entityAccount: tooLongEntityPda,
          user: user.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user.payer])
        .rpc();
      expect.fail("Should have failed due to name too long");
    } catch (error) {
      expect(error).to.be.an("error");

      expect(error.toString()).to.include("NameTooLong");
      console.log("Successfully failed to create entity with too long name.");
    }
  });

  it("Fails to update a non-existent entity", async () => {
    const nonExistentId = new BN(12345);
    const [nonExistentPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("entity_seed"), nonExistentId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    try {
      await program.methods
        .updateEntityStatus(true)
        .accounts({
          entityAccount: nonExistentPda,
          authority: user.publicKey,
        })
        .signers([user.payer])
        .rpc();
      expect.fail("Should have failed because entity does not exist");
    } catch (error) {
      expect(error).to.be.an("error");

      console.log("Error message:", error.toString());
      console.log("Successfully failed to update non-existent entity.");
    }
  });
});
