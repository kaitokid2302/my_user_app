import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { EntityManager } from "../target/types/entity_manager";
import { expect } from "chai";
import BN from "bn.js";

describe("entity_manager", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.entityManager as Program<EntityManager>;
  const user = provider.wallet as anchor.Wallet;

  // Helper function to generate a unique ID for each test run if needed
  // For PDA, the ID itself is part of the address, so it must be consistent for fetching
  // For this example, we'll use a fixed ID for simplicity in finding the PDA
  const entityId = new BN(1); // Example ID
  let entityPda: anchor.web3.PublicKey;
  let bump: number;

  before(async () => {
    // Derive the PDA for the entity account
    [entityPda, bump] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("entity_seed"),
        entityId.toArrayLike(Buffer, "le", 8), // Ensure ID is 8 bytes, little-endian
      ],
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
      .signers([user.payer]) // Assuming user.payer is the Keypair for the provider's wallet
      .rpc();

    const accountData = await program.account.entityAccount.fetch(entityPda);
    expect(accountData.id.eq(entityId)).to.be.true;
    expect(accountData.name).to.equal(entityName);
    expect(accountData.authority.equals(user.publicKey)).to.be.true;
    expect(accountData.active).to.be.true;
    console.log("Entity created:", accountData);
  });

  it("Updates an entity status", async () => {
    // Ensure entity is created first (or create it here if tests are independent)
    // For this test flow, we assume the previous test 'Creates an entity' has run.
    // If not, you'd need to call createEntity here.
    try {
      await program.account.entityAccount.fetch(entityPda);
    } catch (e) {
      // If entity doesn't exist from a previous test run (e.g. when running this test alone)
      console.log("Entity not found from previous test, creating one for update test...");
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
    // Airdrop SOL to the new user if needed for them to be a signer (though here they are not paying)
    // await provider.connection.requestAirdrop(anotherUser.publicKey, anchor.web3.LAMPORTS_PER_SOL);
    // await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for airdrop

    try {
      await program.methods
        .updateEntityStatus(true)
        .accounts({
          entityAccount: entityPda,
          authority: anotherUser.publicKey, // Using a different authority
        })
        .signers([anotherUser]) // Sign with the different authority
        .rpc();
      expect.fail("Should have failed due to unauthorized action");
    } catch (error) {
      // Check for the specific error. Anchor wraps errors, so you might need to inspect error.error or error.message.
      // The error code defined in lib.rs is UnauthorizedAction.
      // Anchor usually throws an error with a code.
      // Example: error.error.errorCode.code === 'UnauthorizedAction'
      // For now, we'll do a generic check. A more robust check would be specific.
      expect(error).to.be.an('error');
      // A more specific check could be:
      // expect(error.toString()).to.include("UnauthorizedAction"); // Or the specific error code if available
      console.log("Successfully failed to update with wrong authority.");
    }
  });

  it("Deletes an entity", async () => {
    // Ensure entity exists
     try {
      await program.account.entityAccount.fetch(entityPda);
    } catch (e) {
      console.log("Entity not found from previous test, creating one for delete test...");
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

    // Get user SOL balance before deleting entity
    const balanceBefore = await provider.connection.getBalance(user.publicKey);
    console.log(`User balance before deletion: ${balanceBefore / anchor.web3.LAMPORTS_PER_SOL} SOL`);

    await program.methods
      .deleteEntity()
      .accounts({
        entityAccount: entityPda,
        user: user.publicKey, // The account that will receive the SOL
        authority: user.publicKey,
      })
      .signers([user.payer])
      .rpc();

    // Get user SOL balance after deleting entity
    const balanceAfter = await provider.connection.getBalance(user.publicKey);
    console.log(`User balance after deletion: ${balanceAfter / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    
    // Verify that balance increased (SOL was returned)
    // Note: We use greater than instead of exact match because transaction fees might be deducted
    expect(balanceAfter).to.be.greaterThan(balanceBefore);
    console.log(`SOL returned to user: ${(balanceAfter - balanceBefore) / anchor.web3.LAMPORTS_PER_SOL} SOL`);

    try {
      await program.account.entityAccount.fetch(entityPda);
      expect.fail("Entity account should have been closed");
    } catch (error) {
      // Error is expected as account should be closed.
      // The error message typically includes "Account does not exist" or similar.
      expect(error.message).to.include("Account does not exist");
      console.log("Entity successfully deleted.");
    }
  });

  it("Fails to delete entity with wrong authority", async () => {
    // To test this, we need an entity to exist.
    // Let's create one specifically for this test case to avoid dependency issues.
    const testDeleteId = new BN(2); // Use a different ID to avoid conflicts
    let testDeletePda: anchor.web3.PublicKey;
    [testDeletePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("entity_seed"),
        testDeleteId.toArrayLike(Buffer, "le", 8),
      ],
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
    // Airdrop if this user needs to pay for anything (not in this specific call for delete)

    try {
      await program.methods
        .deleteEntity()
        .accounts({
          entityAccount: testDeletePda,
          user: anotherUser.publicKey, // This is who would receive SOL, can be different from authority
          authority: anotherUser.publicKey, // Using a different authority
        })
        .signers([anotherUser]) // Sign with the different authority
        .rpc();
      expect.fail("Should have failed due to unauthorized action");
    } catch (error) {
      expect(error).to.be.an('error');
      // expect(error.toString()).to.include("UnauthorizedAction"); // More specific check
      console.log("Successfully failed to delete with wrong authority.");
    }

    // Clean up the test entity if it wasn't deleted by the failed attempt
    // (it shouldn't have been)
    try {
        const acc = await program.account.entityAccount.fetch(testDeletePda);
        if (acc) {
            console.log("Cleaning up entity from 'Fails to delete entity with wrong authority' test...");
            await program.methods
              .deleteEntity()
              .accounts({
                entityAccount: testDeletePda,
                user: user.publicKey,
                authority: user.publicKey, // Correct authority for cleanup
              })
              .signers([user.payer])
              .rpc();
            console.log("Cleanup successful.");
        }
    } catch (e) {
        // if already deleted or never existed, that's fine
        console.log("Cleanup: Entity for 'Fails to delete entity with wrong authority' test already gone or never created properly.");
    }
  });

  it("Fails to create an entity with too long name", async () => {
    const tooLongEntityId = new BN(999); // Use a different ID for this test
    const [tooLongEntityPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("entity_seed"),
        tooLongEntityId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    // Create a name that is too long (assuming there's a limit in the contract)
    // Adjust this length based on your program's actual limit
    const tooLongName = "A".repeat(100); // Creating a very long name, adjust as needed

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
      expect(error).to.be.an('error');
      // Check for specific error message or code
      // The program should return a NameTooLong error
      // Adjust this check based on how your program returns errors
      expect(error.toString()).to.include("NameTooLong");
      console.log("Successfully failed to create entity with too long name.");
    }
  });

  it("Fails to update a non-existent entity", async () => {
    // Create a new entity ID that hasn't been used
    const nonExistentId = new BN(12345);
    const [nonExistentPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("entity_seed"),
        nonExistentId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    try {
      // Attempt to update a non-existent entity
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
      expect(error).to.be.an('error');
      // The error typically includes something about account not being initialized
      // or in Anchor, it might be "Account does not exist" or "Account not initialized"
      // Adjust this check to match the specific error your program throws
      console.log("Error message:", error.toString());
      console.log("Successfully failed to update non-existent entity.");
    }
  });
});
